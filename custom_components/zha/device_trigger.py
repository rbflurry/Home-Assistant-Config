"""Provides device automations for ZHA devices that emit events."""
import voluptuous as vol

import homeassistant.components.automation.event as event
from homeassistant.components.device_automation.exceptions import (
    InvalidDeviceAutomationConfig,
)
from homeassistant.const import CONF_DEVICE_ID, CONF_DOMAIN, CONF_PLATFORM, CONF_TYPE
from homeassistant.components.device_automation import TRIGGER_BASE_SCHEMA

from . import DOMAIN
from .core.helpers import async_get_zha_device

CONF_SUBTYPE = "subtype"
DEVICE = "device"
DEVICE_IEEE = "device_ieee"
ZHA_EVENT = "zha_event"

TRIGGER_SCHEMA = TRIGGER_BASE_SCHEMA.extend(
    {vol.Required(CONF_TYPE): str, vol.Required(CONF_SUBTYPE): str}
)


async def async_attach_trigger(hass, config, action, automation_info):
    """Listen for state changes based on configuration."""
    trigger = (config[CONF_TYPE], config[CONF_SUBTYPE])
    zha_device = await async_get_zha_device(hass, config[CONF_DEVICE_ID])

    if (
        zha_device.device_automation_triggers is None
        or trigger not in zha_device.device_automation_triggers
    ):
        raise InvalidDeviceAutomationConfig

    trigger = zha_device.device_automation_triggers[trigger]

    event_config = {
        event.CONF_EVENT_TYPE: ZHA_EVENT,
        event.CONF_EVENT_DATA: {DEVICE_IEEE: str(zha_device.ieee), **trigger},
    }

    return await event.async_attach_trigger(
        hass, event_config, action, automation_info, platform_type="device"
    )


async def async_get_triggers(hass, device_id):
    """List device triggers.

    Make sure the device supports device automations and
    if it does return the trigger list.
    """
    zha_device = await async_get_zha_device(hass, device_id)

    if not zha_device.device_automation_triggers:
        return

    triggers = []
    for trigger, subtype in zha_device.device_automation_triggers.keys():
        triggers.append(
            {
                CONF_DEVICE_ID: device_id,
                CONF_DOMAIN: DOMAIN,
                CONF_PLATFORM: DEVICE,
                CONF_TYPE: trigger,
                CONF_SUBTYPE: subtype,
            }
        )

    return triggers
