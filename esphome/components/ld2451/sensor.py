import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import sensor
from esphome.const import (
    CONF_ID,
    CONF_SPEED,
    CONF_DISTANCE,
    STATE_CLASS_MEASUREMENT,
)
from . import ld2451_ns, LD2451Component

CONF_LD2451_ID = "ld2451_id"
CONF_ANGLE = "angle"
CONF_TARGET_COUNT = "target_count"
CONF_SNR = "snr" 

CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(CONF_LD2451_ID): cv.use_id(LD2451Component),
    cv.Optional(CONF_SPEED): sensor.sensor_schema(
        unit_of_measurement="mph",
        icon="mdi:speedometer",
        accuracy_decimals=1,
        state_class=STATE_CLASS_MEASUREMENT,
    ),
    cv.Optional(CONF_DISTANCE): sensor.sensor_schema(
        unit_of_measurement="ft",
        icon="mdi:ruler",
        accuracy_decimals=0,
        state_class=STATE_CLASS_MEASUREMENT,
    ),
    cv.Optional(CONF_ANGLE): sensor.sensor_schema(
        unit_of_measurement="°",
        icon="mdi:angle-acute",
        accuracy_decimals=0,
        state_class=STATE_CLASS_MEASUREMENT,
    ),
    cv.Optional(CONF_SNR): sensor.sensor_schema(
        unit_of_measurement="",
        icon="mdi:signal",
        accuracy_decimals=0,
        state_class=STATE_CLASS_MEASUREMENT,
    ),
    cv.Optional(CONF_TARGET_COUNT): sensor.sensor_schema(
        unit_of_measurement="",
        icon="mdi:car-multiple",
        accuracy_decimals=0,
        state_class=STATE_CLASS_MEASUREMENT,
    ),
})

async def to_code(config):
    parent = await cg.get_variable(config[CONF_LD2451_ID])

    if CONF_SPEED in config:
        s = await sensor.new_sensor(config[CONF_SPEED])
        cg.add(parent.set_speed_sensor(s))

    if CONF_DISTANCE in config:
        s = await sensor.new_sensor(config[CONF_DISTANCE])
        cg.add(parent.set_distance_sensor(s))

    if CONF_ANGLE in config:
        s = await sensor.new_sensor(config[CONF_ANGLE])
        cg.add(parent.set_angle_sensor(s))

    if CONF_SNR in config:
        s = await sensor.new_sensor(config[CONF_SNR])
        cg.add(parent.set_snr_sensor(s))

    if CONF_TARGET_COUNT in config:
        s = await sensor.new_sensor(config[CONF_TARGET_COUNT])
        cg.add(parent.set_target_count_sensor(s))