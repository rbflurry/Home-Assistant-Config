"""
Component that will perform object detection and identification via deepstack.

For more details about this platform, please refer to the documentation at
https://home-assistant.io/components/image_processing.deepstack_object
"""
import base64
import datetime
import logging
import os

import requests
import voluptuous as vol

from homeassistant.const import (
    ATTR_ENTITY_ID, ATTR_NAME)
from homeassistant.core import split_entity_id
import homeassistant.helpers.config_validation as cv
from homeassistant.components.image_processing import (
    PLATFORM_SCHEMA, ImageProcessingEntity, ATTR_CONFIDENCE, CONF_SOURCE,
    CONF_ENTITY_ID, CONF_NAME, DOMAIN)
from homeassistant.const import (
    CONF_IP_ADDRESS, CONF_PORT,
    HTTP_BAD_REQUEST, HTTP_OK, HTTP_UNAUTHORIZED)

_LOGGER = logging.getLogger(__name__)

CLASSIFIER = 'deepstack_object'
CONF_TARGET = 'target'
CONF_SAVE_FILE_FOLDER = 'save_file_folder'
DEFAULT_TARGET = 'person'
EVENT_OBJECT_DETECTED = 'image_processing.object_detected'
EVENT_FILE_SAVED = 'image_processing.file_saved'
FILE = 'file'
OBJECT = 'object'


PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({
    vol.Required(CONF_IP_ADDRESS): cv.string,
    vol.Required(CONF_PORT): cv.port,
    vol.Optional(CONF_TARGET, default=DEFAULT_TARGET): cv.string,
    vol.Optional(CONF_SAVE_FILE_FOLDER): cv.isdir,
})


def draw_box(draw, prediction, text='', color=(255, 0, 0)):
    """Draw bounding box on image."""
    (left, right, top, bottom) = (
        prediction['x_min'], prediction['x_max'], prediction['y_min'], prediction['y_max'])
    draw.line([(left, top), (left, bottom), (right, bottom),
               (right, top), (left, top)], width=5, fill=color)
    if text:
        draw.text((left, abs(top-15)), text, fill=color)


def format_confidence(confidence):
    """Takes a confidence from the API like 
       0.55623 and returne 55.6 (%).
    """
    return round(float(confidence)*100, 1)


def get_confidences_above_threshold(confidences, threshold):
    """Takes a list of confidences and returns those above a threshold."""
    return [val for val in confidences if val >= threshold]


def get_object_classes(predictions):
    """
    Get a list of the unique object classes predicted.
    """
    classes = [pred['label'] for pred in predictions]
    return set(classes)


def get_object_instances(predictions, target):
    """
    Return the number of instances of a target class.
    """
    targets_identified = [format_confidence(
        pred['confidence']) for pred in predictions if pred['label'] == target]
    return targets_identified


def get_objects_summary(predictions):
    """
    Get a summary of the objects detected.
    """
    classes = get_object_classes(predictions)
    return {class_cat: len(get_object_instances(predictions, target=class_cat))
            for class_cat in classes}


def post_image(url, image):
    """Post an image to the classifier."""
    try:
        response = requests.post(
            url,
            files={"image": image},
            )
        return response
    except requests.exceptions.ConnectionError:
        _LOGGER.error("ConnectionError: Is %s running?", CLASSIFIER)
        return None


def setup_platform(hass, config, add_devices, discovery_info=None):
    """Set up the classifier."""
    ip_address = config.get(CONF_IP_ADDRESS)
    port = config.get(CONF_PORT)
    target = config.get(CONF_TARGET)
    save_file_folder = config.get(CONF_SAVE_FILE_FOLDER)
    confidence = config.get(ATTR_CONFIDENCE)

    if save_file_folder:
        save_file_folder = os.path.join(
            save_file_folder, '')  # If no trailing / add it

    entities = []
    for camera in config[CONF_SOURCE]:
        object_entity = ObjectClassifyEntity(
            ip_address, port, target, confidence, save_file_folder,
            camera[CONF_ENTITY_ID], camera.get(CONF_NAME))
        entities.append(object_entity)
    add_devices(entities)


class ObjectClassifyEntity(ImageProcessingEntity):
    """Perform a face classification."""

    def __init__(self, ip_address, port, target, confidence, save_file_folder, camera_entity, name=None):
        """Init with the API key and model id."""
        super().__init__()
        self._url_check = "http://{}:{}/v1/vision/detection".format(
            ip_address, port)
        self._target = target
        self._confidence = confidence
        self._camera = camera_entity
        if name:
            self._name = name
        else:
            camera_name = split_entity_id(camera_entity)[1]
            self._name = "{} {}".format(CLASSIFIER, camera_name)
        self._state = None
        self._targets_confidences = []
        self._predictions = {}
        if save_file_folder:
            self._save_file_folder = save_file_folder

    def process_image(self, image):
        """Process an image."""
        response = post_image(
            self._url_check, image)

        if response:
            if response.status_code == HTTP_OK:
                predictions_json = response.json()["predictions"]
                self._targets_confidences = get_object_instances(
                    predictions_json, self._target)
                self._state = len(
                    get_confidences_above_threshold(
                        self._targets_confidences, self._confidence))
                self._predictions = get_objects_summary(predictions_json)
                self.fire_prediction_events(predictions_json, self._confidence)
                if hasattr(self, "_save_file_folder") and self._state > 0:
                    self.save_image(
                        image, predictions_json, self._target, self._save_file_folder)

        else:
            self._state = None
            self._targets_confidences = []
            self._predictions = {}

    def save_image(self, image, predictions_json, target, directory):
        """Save a timestamped image with bounding boxes around targets."""
        from PIL import Image, ImageDraw
        import io
        img = Image.open(io.BytesIO(bytearray(image))).convert('RGB')
        draw = ImageDraw.Draw(img)

        for prediction in predictions_json:
            prediction_confidence = format_confidence(prediction['confidence'])
            if prediction['label'] == target and prediction_confidence >= self._confidence:
                draw_box(draw, prediction, str(prediction_confidence))

        now = datetime.datetime.now().strftime('%Y-%m-%d-%H-%M-%S')
        latest_save_path = directory + 'deepstack_latest_{}.jpg'.format(target)
        timestamp_save_path = directory + 'deepstack_{}_{}.jpg'.format(target, now)
        try:
            img.save(latest_save_path)
            img.save(timestamp_save_path)
            self.fire_saved_file_event(timestamp_save_path)
            _LOGGER.info("Saved bounding box image to %s", timestamp_save_path)
        except Exception as exc:
            _LOGGER.error("Error saving bounding box image : %s", exc)

    def fire_prediction_events(self, predictions_json, confidence):
        """Fire events based on predictions if above confidence threshold."""

        for prediction in predictions_json:
            if format_confidence(prediction['confidence']) > confidence:
                self.hass.bus.fire(
                    EVENT_OBJECT_DETECTED, {
                        'classifier': CLASSIFIER,
                        ATTR_ENTITY_ID: self.entity_id,
                        OBJECT: prediction['label'],
                        ATTR_CONFIDENCE: format_confidence(
                            prediction['confidence'])
                    })

    def fire_saved_file_event(self, save_path):
        """Fire event when saving a file"""
        self.hass.bus.fire(
            EVENT_FILE_SAVED, {
                'classifier': CLASSIFIER,
                ATTR_ENTITY_ID: self.entity_id,
                FILE: save_path
                })

    @property
    def camera_entity(self):
        """Return camera entity id from process pictures."""
        return self._camera

    @property
    def state(self):
        """Return the state of the entity."""
        return self._state

    @property
    def name(self):
        """Return the name of the sensor."""
        return self._name

    @property
    def device_state_attributes(self):
        """Return device specific state attributes."""
        attr = {}
        attr['target'] = self._target
        attr['target_confidences'] = self._targets_confidences
        attr['all_predictions'] = self._predictions
        if hasattr(self, "_save_file_folder"):
            attr['save_file_folder'] = self._save_file_folder
        return attr

