"""
Lighting channels module for Zigbee Home Automation.

For more details about this component, please refer to the documentation at
https://home-assistant.io/components/zha/
"""
import logging

import zigpy.zcl.clusters.lighting as lighting

from . import ZigbeeChannel
from .. import registries
from ..const import REPORT_CONFIG_DEFAULT

_LOGGER = logging.getLogger(__name__)


@registries.ZIGBEE_CHANNEL_REGISTRY.register(lighting.Ballast.cluster_id)
class Ballast(ZigbeeChannel):
    """Ballast channel."""

    pass


@registries.BINDABLE_CLUSTERS.register(lighting.Color.cluster_id)
@registries.EVENT_RELAY_CLUSTERS.register(lighting.Color.cluster_id)
@registries.LIGHT_CLUSTERS.register(lighting.Color.cluster_id)
@registries.ZIGBEE_CHANNEL_REGISTRY.register(lighting.Color.cluster_id)
class ColorChannel(ZigbeeChannel):
    """Color channel."""

    CAPABILITIES_COLOR_XY = 0x08
    CAPABILITIES_COLOR_TEMP = 0x10
    UNSUPPORTED_ATTRIBUTE = 0x86
    REPORT_CONFIG = (
        {"attr": "current_x", "config": REPORT_CONFIG_DEFAULT},
        {"attr": "current_y", "config": REPORT_CONFIG_DEFAULT},
        {"attr": "color_temperature", "config": REPORT_CONFIG_DEFAULT},
    )

    def __init__(self, cluster, device):
        """Initialize ColorChannel."""
        super().__init__(cluster, device)
        self._color_capabilities = None

    def get_color_capabilities(self):
        """Return the color capabilities."""
        return self._color_capabilities

    async def async_configure(self):
        """Configure channel."""
        await self.fetch_color_capabilities(False)
        await super().async_configure()

    async def async_initialize(self, from_cache):
        """Initialize channel."""
        await self.fetch_color_capabilities(True)
        await self.get_attribute_value("color_temperature", from_cache=from_cache)
        await self.get_attribute_value("current_x", from_cache=from_cache)
        await self.get_attribute_value("current_y", from_cache=from_cache)

    async def fetch_color_capabilities(self, from_cache):
        """Get the color configuration."""
        capabilities = await self.get_attribute_value(
            "color_capabilities", from_cache=from_cache
        )

        if capabilities is None:
            # ZCL Version 4 devices don't support the color_capabilities
            # attribute. In this version XY support is mandatory, but we
            # need to probe to determine if the device supports color
            # temperature.
            capabilities = self.CAPABILITIES_COLOR_XY
            result = await self.get_attribute_value(
                "color_temperature", from_cache=from_cache
            )

            if result is not self.UNSUPPORTED_ATTRIBUTE:
                capabilities |= self.CAPABILITIES_COLOR_TEMP
        self._color_capabilities = capabilities
        await super().async_initialize(from_cache)
