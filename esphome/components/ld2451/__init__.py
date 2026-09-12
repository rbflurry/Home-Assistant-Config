import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import uart
from esphome.const import CONF_ID

DEPENDENCIES = ["uart"]
AUTO_LOAD = ["sensor", "binary_sensor"]
MULTI_CONF = True

ld2451_ns = cg.esphome_ns.namespace("ld2451")
LD2451Component = ld2451_ns.class_(
    "LD2451Component", cg.Component, uart.UARTDevice
)

CONF_MIN_ANGLE = "min_angle"
CONF_MAX_ANGLE = "max_angle"
CONF_MIN_DISTANCE = "min_distance"
CONF_MAX_DISTANCE = "max_distance"
CONF_MIN_SNR = "min_snr"
CONF_MIN_SPEED = "min_speed"

CONFIG_SCHEMA = (
    cv.Schema({
        cv.GenerateID(): cv.declare_id(LD2451Component),
        cv.Optional(CONF_MIN_ANGLE, default=-30): cv.int_range(min=-75, max=75),
        cv.Optional(CONF_MAX_ANGLE, default=30):  cv.int_range(min=-75, max=75),
        cv.Optional(CONF_MIN_DISTANCE, default=0):   cv.positive_int,
        cv.Optional(CONF_MAX_DISTANCE, default=100): cv.positive_int,
        cv.Optional(CONF_MIN_SNR, default=0):   cv.positive_int,
        cv.Optional(CONF_MIN_SPEED, default=0): cv.positive_int,
    })
    .extend(uart.UART_DEVICE_SCHEMA)
    .extend(cv.COMPONENT_SCHEMA)
)

async def to_code(config):
    var = cg.new_Pvariable(config[CONF_ID])
    await cg.register_component(var, config)
    await uart.register_uart_device(var, config)

    cg.add(var.set_min_angle(config[CONF_MIN_ANGLE]))
    cg.add(var.set_max_angle(config[CONF_MAX_ANGLE]))
    cg.add(var.set_min_distance(config[CONF_MIN_DISTANCE]))
    cg.add(var.set_max_distance(config[CONF_MAX_DISTANCE]))
    cg.add(var.set_min_snr(config[CONF_MIN_SNR]))
    cg.add(var.set_min_speed(config[CONF_MIN_SPEED]))