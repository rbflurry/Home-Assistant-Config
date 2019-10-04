"""All constants related to the ZHA component."""
import enum
import logging

from homeassistant.components.binary_sensor import DOMAIN as BINARY_SENSOR
from homeassistant.components.device_tracker import DOMAIN as DEVICE_TRACKER
from homeassistant.components.fan import DOMAIN as FAN
from homeassistant.components.light import DOMAIN as LIGHT
from homeassistant.components.lock import DOMAIN as LOCK
from homeassistant.components.sensor import DOMAIN as SENSOR
from homeassistant.components.switch import DOMAIN as SWITCH

ATTR_ARGS = "args"
ATTR_ATTRIBUTE = "attribute"
ATTR_AVAILABLE = "available"
ATTR_CLUSTER_ID = "cluster_id"
ATTR_CLUSTER_TYPE = "cluster_type"
ATTR_COMMAND = "command"
ATTR_COMMAND_TYPE = "command_type"
ATTR_ENDPOINT_ID = "endpoint_id"
ATTR_IEEE = "ieee"
ATTR_LAST_SEEN = "last_seen"
ATTR_LEVEL = "level"
ATTR_LQI = "lqi"
ATTR_MANUFACTURER = "manufacturer"
ATTR_MANUFACTURER_CODE = "manufacturer_code"
ATTR_MODEL = "model"
ATTR_NAME = "name"
ATTR_NWK = "nwk"
ATTR_POWER_SOURCE = "power_source"
ATTR_QUIRK_APPLIED = "quirk_applied"
ATTR_QUIRK_CLASS = "quirk_class"
ATTR_RSSI = "rssi"
ATTR_SIGNATURE = "signature"
ATTR_TYPE = "type"
ATTR_VALUE = "value"

BAUD_RATES = [2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 128000, 256000]

CHANNEL_ATTRIBUTE = "attribute"
CHANNEL_BASIC = "basic"
CHANNEL_COLOR = "light_color"
CHANNEL_DOORLOCK = "door_lock"
CHANNEL_ELECTRICAL_MEASUREMENT = "electrical_measurement"
CHANNEL_EVENT_RELAY = "event_relay"
CHANNEL_FAN = "fan"
CHANNEL_LEVEL = ATTR_LEVEL
CHANNEL_ON_OFF = "on_off"
CHANNEL_POWER_CONFIGURATION = "power"
CHANNEL_ZDO = "zdo"
CHANNEL_ZONE = ZONE = "ias_zone"

CLUSTER_COMMAND_SERVER = "server"
CLUSTER_COMMANDS_CLIENT = "client_commands"
CLUSTER_COMMANDS_SERVER = "server_commands"
CLUSTER_TYPE_IN = "in"
CLUSTER_TYPE_OUT = "out"

COMPONENTS = (BINARY_SENSOR, DEVICE_TRACKER, FAN, LIGHT, LOCK, SENSOR, SWITCH)

CONF_BAUDRATE = "baudrate"
CONF_DATABASE = "database_path"
CONF_DEVICE_CONFIG = "device_config"
CONF_ENABLE_QUIRKS = "enable_quirks"
CONF_RADIO_TYPE = "radio_type"
CONF_USB_PATH = "usb_path"
CONTROLLER = "controller"

DATA_DEVICE_CONFIG = "zha_device_config"
DATA_ZHA = "zha"
DATA_ZHA_CONFIG = "config"
DATA_ZHA_BRIDGE_ID = "zha_bridge_id"
DATA_ZHA_CORE_EVENTS = "zha_core_events"
DATA_ZHA_DISPATCHERS = "zha_dispatchers"
DATA_ZHA_GATEWAY = "zha_gateway"

DEBUG_COMP_BELLOWS = "bellows"
DEBUG_COMP_ZHA = "homeassistant.components.zha"
DEBUG_COMP_ZIGPY = "zigpy"
DEBUG_COMP_ZIGPY_DECONZ = "zigpy_deconz"
DEBUG_COMP_ZIGPY_XBEE = "zigpy_xbee"
DEBUG_COMP_ZIGPY_ZIGATE = "zigpy_zigate"
DEBUG_LEVEL_CURRENT = "current"
DEBUG_LEVEL_ORIGINAL = "original"
DEBUG_LEVELS = {
    DEBUG_COMP_BELLOWS: logging.DEBUG,
    DEBUG_COMP_ZHA: logging.DEBUG,
    DEBUG_COMP_ZIGPY: logging.DEBUG,
    DEBUG_COMP_ZIGPY_XBEE: logging.DEBUG,
    DEBUG_COMP_ZIGPY_DECONZ: logging.DEBUG,
    DEBUG_COMP_ZIGPY_ZIGATE: logging.DEBUG,
}
DEBUG_RELAY_LOGGERS = [DEBUG_COMP_ZHA, DEBUG_COMP_ZIGPY]

DEFAULT_RADIO_TYPE = "ezsp"
DEFAULT_BAUDRATE = 57600
DEFAULT_DATABASE_NAME = "zigbee.db"
DISCOVERY_KEY = "zha_discovery_info"

DOMAIN = "zha"

MFG_CLUSTER_ID_START = 0xFC00

POWER_MAINS_POWERED = "Mains"
POWER_BATTERY_OR_UNKNOWN = "Battery or Unknown"


class RadioType(enum.Enum):
    """Possible options for radio type."""

    ezsp = "ezsp"
    xbee = "xbee"
    deconz = "deconz"
    zigate = "zigate"

    @classmethod
    def list(cls):
        """Return list of enum's values."""
        return [e.value for e in RadioType]


REPORT_CONFIG_MAX_INT = 900
REPORT_CONFIG_MAX_INT_BATTERY_SAVE = 10800
REPORT_CONFIG_MIN_INT = 30
REPORT_CONFIG_MIN_INT_ASAP = 1
REPORT_CONFIG_MIN_INT_IMMEDIATE = 0
REPORT_CONFIG_MIN_INT_OP = 5
REPORT_CONFIG_MIN_INT_BATTERY_SAVE = 3600
REPORT_CONFIG_RPT_CHANGE = 1
REPORT_CONFIG_DEFAULT = (
    REPORT_CONFIG_MIN_INT,
    REPORT_CONFIG_MAX_INT,
    REPORT_CONFIG_RPT_CHANGE,
)
REPORT_CONFIG_ASAP = (
    REPORT_CONFIG_MIN_INT_ASAP,
    REPORT_CONFIG_MAX_INT,
    REPORT_CONFIG_RPT_CHANGE,
)
REPORT_CONFIG_BATTERY_SAVE = (
    REPORT_CONFIG_MIN_INT_BATTERY_SAVE,
    REPORT_CONFIG_MAX_INT_BATTERY_SAVE,
    REPORT_CONFIG_RPT_CHANGE,
)
REPORT_CONFIG_IMMEDIATE = (
    REPORT_CONFIG_MIN_INT_IMMEDIATE,
    REPORT_CONFIG_MAX_INT,
    REPORT_CONFIG_RPT_CHANGE,
)
REPORT_CONFIG_OP = (
    REPORT_CONFIG_MIN_INT_OP,
    REPORT_CONFIG_MAX_INT,
    REPORT_CONFIG_RPT_CHANGE,
)

SENSOR_ACCELERATION = "acceleration"
SENSOR_BATTERY = "battery"
SENSOR_ELECTRICAL_MEASUREMENT = "electrical_measurement"
SENSOR_GENERIC = "generic"
SENSOR_HUMIDITY = "humidity"
SENSOR_ILLUMINANCE = "illuminance"
SENSOR_METERING = "metering"
SENSOR_OCCUPANCY = "occupancy"
SENSOR_OPENING = "opening"
SENSOR_PRESSURE = "pressure"
SENSOR_TEMPERATURE = "temperature"
SENSOR_TYPE = "sensor_type"

SIGNAL_ATTR_UPDATED = "attribute_updated"
SIGNAL_AVAILABLE = "available"
SIGNAL_MOVE_LEVEL = "move_level"
SIGNAL_REMOVE = "remove"
SIGNAL_SET_LEVEL = "set_level"
SIGNAL_STATE_ATTR = "update_state_attribute"

UNKNOWN = "unknown"
UNKNOWN_MANUFACTURER = "unk_manufacturer"
UNKNOWN_MODEL = "unk_model"

ZHA_DISCOVERY_NEW = "zha_discovery_new_{}"
ZHA_GW_MSG_RAW_INIT = "raw_device_initialized"
ZHA_GW_MSG = "zha_gateway_message"
ZHA_GW_MSG_DEVICE_REMOVED = "device_removed"
ZHA_GW_MSG_DEVICE_INFO = "device_info"
ZHA_GW_MSG_DEVICE_FULL_INIT = "device_fully_initialized"
ZHA_GW_MSG_DEVICE_JOINED = "device_joined"
ZHA_GW_MSG_LOG_OUTPUT = "log_output"
ZHA_GW_MSG_LOG_ENTRY = "log_entry"
ZHA_GW_RADIO = "radio"
ZHA_GW_RADIO_DESCRIPTION = "radio_description"
