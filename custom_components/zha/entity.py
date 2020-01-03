"""Entity for Zigbee Home Automation."""

import asyncio
import logging
import time

from homeassistant.core import callback
from homeassistant.helpers import entity
from homeassistant.helpers.device_registry import CONNECTION_ZIGBEE
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.restore_state import RestoreEntity

from .core.const import (
    ATTR_MANUFACTURER,
    ATTR_MODEL,
    ATTR_NAME,
    DATA_ZHA,
    DATA_ZHA_BRIDGE_ID,
    DOMAIN,
    SIGNAL_REMOVE,
)
from .core.helpers import LogMixin

_LOGGER = logging.getLogger(__name__)

ENTITY_SUFFIX = "entity_suffix"
RESTART_GRACE_PERIOD = 7200  # 2 hours


class ZhaEntity(RestoreEntity, LogMixin, entity.Entity):
    """A base class for ZHA entities."""

    _domain = None  # Must be overridden by subclasses

    def __init__(self, unique_id, zha_device, channels, skip_entity_id=False, **kwargs):
        """Init ZHA entity."""
        self._force_update = False
        self._should_poll = False
        self._unique_id = unique_id
        ieeetail = "".join([f"{o:02x}" for o in zha_device.ieee[:4]])
        ch_names = [ch.cluster.ep_attribute for ch in channels]
        ch_names = ", ".join(sorted(ch_names))
        self._name = f"{zha_device.name} {ieeetail} {ch_names}"
        self._state = None
        self._device_state_attributes = {}
        self._zha_device = zha_device
        self.cluster_channels = {}
        self._available = False
        self._component = kwargs["component"]
        self._unsubs = []
        self.remove_future = None
        for channel in channels:
            self.cluster_channels[channel.name] = channel

    @property
    def name(self):
        """Return Entity's default name."""
        return self._name

    @property
    def unique_id(self) -> str:
        """Return a unique ID."""
        return self._unique_id

    @property
    def zha_device(self):
        """Return the zha device this entity is attached to."""
        return self._zha_device

    @property
    def device_state_attributes(self):
        """Return device specific state attributes."""
        return self._device_state_attributes

    @property
    def force_update(self) -> bool:
        """Force update this entity."""
        return self._force_update

    @property
    def should_poll(self) -> bool:
        """Poll state from device."""
        return self._should_poll

    @property
    def device_info(self):
        """Return a device description for device registry."""
        zha_device_info = self._zha_device.device_info
        ieee = zha_device_info["ieee"]
        return {
            "connections": {(CONNECTION_ZIGBEE, ieee)},
            "identifiers": {(DOMAIN, ieee)},
            ATTR_MANUFACTURER: zha_device_info[ATTR_MANUFACTURER],
            ATTR_MODEL: zha_device_info[ATTR_MODEL],
            ATTR_NAME: zha_device_info[ATTR_NAME],
            "via_device": (DOMAIN, self.hass.data[DATA_ZHA][DATA_ZHA_BRIDGE_ID]),
        }

    @property
    def available(self):
        """Return entity availability."""
        return self._available

    def async_set_available(self, available):
        """Set entity availability."""
        self._available = available
        self.async_schedule_update_ha_state()

    def async_update_state_attribute(self, key, value):
        """Update a single device state attribute."""
        self._device_state_attributes.update({key: value})
        self.async_schedule_update_ha_state()

    def async_set_state(self, state):
        """Set the entity state."""
        pass

    async def async_added_to_hass(self):
        """Run when about to be added to hass."""
        await super().async_added_to_hass()
        self.remove_future = asyncio.Future()
        await self.async_check_recently_seen()
        await self.async_accept_signal(
            None,
            "{}_{}".format(self.zha_device.available_signal, "entity"),
            self.async_set_available,
            signal_override=True,
        )
        await self.async_accept_signal(
            None,
            "{}_{}".format(SIGNAL_REMOVE, str(self.zha_device.ieee)),
            self.async_remove,
            signal_override=True,
        )
        self._zha_device.gateway.register_entity_reference(
            self._zha_device.ieee,
            self.entity_id,
            self._zha_device,
            self.cluster_channels,
            self.device_info,
            self.remove_future,
        )

    async def async_check_recently_seen(self):
        """Check if the device was seen within the last 2 hours."""
        last_state = await self.async_get_last_state()
        if (
            last_state
            and self._zha_device.last_seen
            and (time.time() - self._zha_device.last_seen < RESTART_GRACE_PERIOD)
        ):
            self.async_set_available(True)
            if not self.zha_device.is_mains_powered:
                # mains powered devices will get real time state
                self.async_restore_last_state(last_state)
            self._zha_device.set_available(True)

    async def async_will_remove_from_hass(self) -> None:
        """Disconnect entity object when removed."""
        for unsub in self._unsubs[:]:
            unsub()
            self._unsubs.remove(unsub)
        self.zha_device.gateway.remove_entity_reference(self)
        self.remove_future.set_result(True)

    @callback
    def async_restore_last_state(self, last_state):
        """Restore previous state."""
        pass

    async def async_update(self):
        """Retrieve latest state."""
        for channel in self.cluster_channels.values():
            if hasattr(channel, "async_update"):
                await channel.async_update()

    async def async_accept_signal(self, channel, signal, func, signal_override=False):
        """Accept a signal from a channel."""
        unsub = None
        if signal_override:
            unsub = async_dispatcher_connect(self.hass, signal, func)
        else:
            unsub = async_dispatcher_connect(
                self.hass, f"{channel.unique_id}_{signal}", func
            )
        self._unsubs.append(unsub)

    def log(self, level, msg, *args):
        """Log a message."""
        msg = "%s: " + msg
        args = (self.entity_id,) + args
        _LOGGER.log(level, msg, *args)
