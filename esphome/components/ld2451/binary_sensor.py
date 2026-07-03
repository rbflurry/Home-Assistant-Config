import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import binary_sensor
from . import ld2451_ns, LD2451Component

CONF_LD2451_ID = "ld2451_id"
CONF_APPROACHING = "approaching"

CONFIG_SCHEMA = cv.Schema({
    cv.GenerateID(CONF_LD2451_ID): cv.use_id(LD2451Component),
    cv.Optional(CONF_APPROACHING): binary_sensor.binary_sensor_schema(
        icon="mdi:car-arrow-right",
    ),
})

async def to_code(config):
    parent = await cg.get_variable(config[CONF_LD2451_ID])

    if CONF_APPROACHING in config:
        s = await binary_sensor.new_binary_sensor(config[CONF_APPROACHING])
        cg.add(parent.set_approaching_sensor(s))