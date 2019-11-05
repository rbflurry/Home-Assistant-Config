"""
Closures channels module for Zigbee Home Automation.

For more details about this component, please refer to the documentation at
https://home-assistant.io/integrations/zha/
"""
import logging

import zigpy.zcl.clusters.closures as closures

from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from . import ZigbeeChannel
from .. import registries
from ..const import REPORT_CONFIG_IMMEDIATE, SIGNAL_ATTR_UPDATED

_LOGGER = logging.getLogger(__name__)


@registries.ZIGBEE_CHANNEL_REGISTRY.register(closures.DoorLock.cluster_id)
class DoorLockChannel(ZigbeeChannel):
    """Door lock channel."""

    _value_attribute = 0
    REPORT_CONFIG = ({"attr": "lock_state", "config": REPORT_CONFIG_IMMEDIATE},)

    async def async_update(self):
        """Retrieve latest state."""
        result = await self.get_attribute_value("lock_state", from_cache=True)

        async_dispatcher_send(
            self._zha_device.hass, f"{self.unique_id}_{SIGNAL_ATTR_UPDATED}", result
        )

    @callback
    def attribute_updated(self, attrid, value):
        """Handle attribute update from lock cluster."""
        attr_name = self.cluster.attributes.get(attrid, [attrid])[0]
        self.debug(
            "Attribute report '%s'[%s] = %s", self.cluster.name, attr_name, value
        )
        if attrid == self._value_attribute:
            async_dispatcher_send(
                self._zha_device.hass, f"{self.unique_id}_{SIGNAL_ATTR_UPDATED}", value
            )

    async def async_initialize(self, from_cache):
        """Initialize channel."""
        await self.get_attribute_value(self._value_attribute, from_cache=from_cache)
        await super().async_initialize(from_cache)


@registries.ZIGBEE_CHANNEL_REGISTRY.register(closures.Shade.cluster_id)
class Shade(ZigbeeChannel):
    """Shade channel."""

    pass


@registries.ZIGBEE_CHANNEL_REGISTRY.register(closures.WindowCovering.cluster_id)
class WindowCovering(ZigbeeChannel):
    """Window channel."""

    pass
