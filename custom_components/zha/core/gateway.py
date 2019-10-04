"""
Virtual gateway for Zigbee Home Automation.

For more details about this component, please refer to the documentation at
https://home-assistant.io/components/zha/
"""

import asyncio
import collections
import itertools
import logging
import os
import traceback

from homeassistant.components.system_log import LogEntry, _figure_out_source
from homeassistant.core import callback
from homeassistant.helpers.device_registry import (
    CONNECTION_ZIGBEE,
    async_get_registry as get_dev_reg,
)
from homeassistant.helpers.dispatcher import async_dispatcher_send

from ..api import async_get_device_info
from .const import (
    ATTR_IEEE,
    ATTR_MANUFACTURER,
    ATTR_MODEL,
    ATTR_NWK,
    ATTR_SIGNATURE,
    ATTR_TYPE,
    CONF_BAUDRATE,
    CONF_DATABASE,
    CONF_RADIO_TYPE,
    CONF_USB_PATH,
    CONTROLLER,
    DATA_ZHA,
    DATA_ZHA_BRIDGE_ID,
    DATA_ZHA_GATEWAY,
    DEBUG_COMP_BELLOWS,
    DEBUG_COMP_ZHA,
    DEBUG_COMP_ZIGPY,
    DEBUG_COMP_ZIGPY_DECONZ,
    DEBUG_COMP_ZIGPY_XBEE,
    DEBUG_COMP_ZIGPY_ZIGATE,
    DEBUG_LEVEL_CURRENT,
    DEBUG_LEVEL_ORIGINAL,
    DEBUG_LEVELS,
    DEBUG_RELAY_LOGGERS,
    DEFAULT_BAUDRATE,
    DEFAULT_DATABASE_NAME,
    DOMAIN,
    SIGNAL_REMOVE,
    UNKNOWN_MANUFACTURER,
    UNKNOWN_MODEL,
    ZHA_GW_MSG,
    ZHA_GW_MSG_DEVICE_FULL_INIT,
    ZHA_GW_MSG_DEVICE_INFO,
    ZHA_GW_MSG_DEVICE_JOINED,
    ZHA_GW_MSG_DEVICE_REMOVED,
    ZHA_GW_MSG_LOG_ENTRY,
    ZHA_GW_MSG_LOG_OUTPUT,
    ZHA_GW_MSG_RAW_INIT,
    ZHA_GW_RADIO,
    ZHA_GW_RADIO_DESCRIPTION,
)
from .device import DeviceStatus, ZHADevice
from .discovery import async_dispatch_discovery_info, async_process_endpoint
from .patches import apply_application_controller_patch
from .registries import RADIO_TYPES
from .store import async_get_registry

_LOGGER = logging.getLogger(__name__)

EntityReference = collections.namedtuple(
    "EntityReference",
    "reference_id zha_device cluster_channels device_info remove_future",
)


class ZHAGateway:
    """Gateway that handles events that happen on the ZHA Zigbee network."""

    def __init__(self, hass, config, config_entry):
        """Initialize the gateway."""
        self._hass = hass
        self._config = config
        self._devices = {}
        self._device_registry = collections.defaultdict(list)
        self.zha_storage = None
        self.ha_device_registry = None
        self.application_controller = None
        self.radio_description = None
        hass.data[DATA_ZHA][DATA_ZHA_GATEWAY] = self
        self._log_levels = {
            DEBUG_LEVEL_ORIGINAL: async_capture_log_levels(),
            DEBUG_LEVEL_CURRENT: async_capture_log_levels(),
        }
        self.debug_enabled = False
        self._log_relay_handler = LogRelayHandler(hass, self)
        self._config_entry = config_entry

    async def async_initialize(self):
        """Initialize controller and connect radio."""
        self.zha_storage = await async_get_registry(self._hass)
        self.ha_device_registry = await get_dev_reg(self._hass)

        usb_path = self._config_entry.data.get(CONF_USB_PATH)
        baudrate = self._config.get(CONF_BAUDRATE, DEFAULT_BAUDRATE)
        radio_type = self._config_entry.data.get(CONF_RADIO_TYPE)

        radio_details = RADIO_TYPES[radio_type][ZHA_GW_RADIO]()
        radio = radio_details[ZHA_GW_RADIO]
        self.radio_description = RADIO_TYPES[radio_type][ZHA_GW_RADIO_DESCRIPTION]
        await radio.connect(usb_path, baudrate)

        if CONF_DATABASE in self._config:
            database = self._config[CONF_DATABASE]
        else:
            database = os.path.join(self._hass.config.config_dir, DEFAULT_DATABASE_NAME)

        self.application_controller = radio_details[CONTROLLER](radio, database)
        apply_application_controller_patch(self)
        self.application_controller.add_listener(self)
        await self.application_controller.startup(auto_form=True)
        self._hass.data[DATA_ZHA][DATA_ZHA_BRIDGE_ID] = str(
            self.application_controller.ieee
        )

        init_tasks = []
        semaphore = asyncio.Semaphore(2)

        async def init_with_semaphore(coro, semaphore):
            """Don't flood the zigbee network during initialization."""
            async with semaphore:
                await coro

        for device in self.application_controller.devices.values():
            if device.nwk == 0x0000:
                continue
            init_tasks.append(
                init_with_semaphore(self.async_device_restored(device), semaphore)
            )
        await asyncio.gather(*init_tasks)

    def device_joined(self, device):
        """Handle device joined.

        At this point, no information about the device is known other than its
        address
        """
        async_dispatcher_send(
            self._hass,
            ZHA_GW_MSG,
            {
                ATTR_TYPE: ZHA_GW_MSG_DEVICE_JOINED,
                ATTR_NWK: device.nwk,
                ATTR_IEEE: str(device.ieee),
            },
        )

    def raw_device_initialized(self, device):
        """Handle a device initialization without quirks loaded."""
        if device.nwk == 0x0000:
            return

        manuf = device.manufacturer
        async_dispatcher_send(
            self._hass,
            ZHA_GW_MSG,
            {
                ATTR_TYPE: ZHA_GW_MSG_RAW_INIT,
                ATTR_NWK: device.nwk,
                ATTR_IEEE: str(device.ieee),
                ATTR_MODEL: device.model if device.model else UNKNOWN_MODEL,
                ATTR_MANUFACTURER: manuf if manuf else UNKNOWN_MANUFACTURER,
                ATTR_SIGNATURE: device.get_signature(),
            },
        )

    def device_initialized(self, device):
        """Handle device joined and basic information discovered."""
        self._hass.async_create_task(self.async_device_initialized(device))

    def device_left(self, device):
        """Handle device leaving the network."""
        pass

    async def _async_remove_device(self, device, entity_refs):
        if entity_refs is not None:
            remove_tasks = []
            for entity_ref in entity_refs:
                remove_tasks.append(entity_ref.remove_future)
            await asyncio.wait(remove_tasks)
        reg_device = self.ha_device_registry.async_get_device(
            {(DOMAIN, str(device.ieee))}, set()
        )
        if reg_device is not None:
            self.ha_device_registry.async_remove_device(reg_device.id)

    def device_removed(self, device):
        """Handle device being removed from the network."""
        zha_device = self._devices.pop(device.ieee, None)
        entity_refs = self._device_registry.pop(device.ieee, None)
        if zha_device is not None:
            device_info = async_get_device_info(self._hass, zha_device)
            zha_device.async_unsub_dispatcher()
            async_dispatcher_send(
                self._hass, "{}_{}".format(SIGNAL_REMOVE, str(zha_device.ieee))
            )
            asyncio.ensure_future(self._async_remove_device(zha_device, entity_refs))
            if device_info is not None:
                async_dispatcher_send(
                    self._hass,
                    ZHA_GW_MSG,
                    {
                        ATTR_TYPE: ZHA_GW_MSG_DEVICE_REMOVED,
                        ZHA_GW_MSG_DEVICE_INFO: device_info,
                    },
                )

    def get_device(self, ieee):
        """Return ZHADevice for given ieee."""
        return self._devices.get(ieee)

    def get_entity_reference(self, entity_id):
        """Return entity reference for given entity_id if found."""
        for entity_reference in itertools.chain.from_iterable(
            self.device_registry.values()
        ):
            if entity_id == entity_reference.reference_id:
                return entity_reference

    def remove_entity_reference(self, entity):
        """Remove entity reference for given entity_id if found."""
        if entity.zha_device.ieee in self.device_registry:
            entity_refs = self.device_registry.get(entity.zha_device.ieee)
            self.device_registry[entity.zha_device.ieee] = [
                e for e in entity_refs if e.reference_id != entity.entity_id
            ]

    @property
    def devices(self):
        """Return devices."""
        return self._devices

    @property
    def device_registry(self):
        """Return entities by ieee."""
        return self._device_registry

    def register_entity_reference(
        self,
        ieee,
        reference_id,
        zha_device,
        cluster_channels,
        device_info,
        remove_future,
    ):
        """Record the creation of a hass entity associated with ieee."""
        self._device_registry[ieee].append(
            EntityReference(
                reference_id=reference_id,
                zha_device=zha_device,
                cluster_channels=cluster_channels,
                device_info=device_info,
                remove_future=remove_future,
            )
        )

    @callback
    def async_enable_debug_mode(self):
        """Enable debug mode for ZHA."""
        self._log_levels[DEBUG_LEVEL_ORIGINAL] = async_capture_log_levels()
        async_set_logger_levels(DEBUG_LEVELS)
        self._log_levels[DEBUG_LEVEL_CURRENT] = async_capture_log_levels()

        for logger_name in DEBUG_RELAY_LOGGERS:
            logging.getLogger(logger_name).addHandler(self._log_relay_handler)

        self.debug_enabled = True

    @callback
    def async_disable_debug_mode(self):
        """Disable debug mode for ZHA."""
        async_set_logger_levels(self._log_levels[DEBUG_LEVEL_ORIGINAL])
        self._log_levels[DEBUG_LEVEL_CURRENT] = async_capture_log_levels()
        for logger_name in DEBUG_RELAY_LOGGERS:
            logging.getLogger(logger_name).removeHandler(self._log_relay_handler)
        self.debug_enabled = False

    @callback
    def _async_get_or_create_device(self, zigpy_device):
        """Get or create a ZHA device."""
        zha_device = self._devices.get(zigpy_device.ieee)
        if zha_device is None:
            zha_device = ZHADevice(self._hass, zigpy_device, self)
            self._devices[zigpy_device.ieee] = zha_device
            self.ha_device_registry.async_get_or_create(
                config_entry_id=self._config_entry.entry_id,
                connections={(CONNECTION_ZIGBEE, str(zha_device.ieee))},
                identifiers={(DOMAIN, str(zha_device.ieee))},
                name=zha_device.name,
                manufacturer=zha_device.manufacturer,
                model=zha_device.model,
            )
        entry = self.zha_storage.async_get_or_create(zha_device)
        zha_device.async_update_last_seen(entry.last_seen)
        return zha_device

    @callback
    def async_device_became_available(
        self, sender, is_reply, profile, cluster, src_ep, dst_ep, tsn, command_id, args
    ):
        """Handle tasks when a device becomes available."""
        self.async_update_device(sender)

    @callback
    def async_update_device(self, sender):
        """Update device that has just become available."""
        if sender.ieee in self.devices:
            device = self.devices[sender.ieee]
            # avoid a race condition during new joins
            if device.status is DeviceStatus.INITIALIZED:
                device.update_available(True)

    async def async_update_device_storage(self):
        """Update the devices in the store."""
        for device in self.devices.values():
            self.zha_storage.async_update(device)
        await self.zha_storage.async_save()

    async def async_device_initialized(self, device):
        """Handle device joined and basic information discovered (async)."""
        if device.nwk == 0x0000:
            return

        zha_device = self._async_get_or_create_device(device)

        _LOGGER.debug(
            "device - %s entering async_device_initialized - is_new_join: %s",
            "0x{:04x}:{}".format(device.nwk, device.ieee),
            zha_device.status is not DeviceStatus.INITIALIZED,
        )

        if zha_device.status is DeviceStatus.INITIALIZED:
            # ZHA already has an initialized device so either the device was assigned a
            # new nwk or device was physically reset and added again without being removed
            _LOGGER.debug(
                "device - %s has been reset and readded or its nwk address changed",
                "0x{:04x}:{}".format(device.nwk, device.ieee),
            )
            await self._async_device_rejoined(zha_device)
        else:
            _LOGGER.debug(
                "device - %s has joined the ZHA zigbee network",
                "0x{:04x}:{}".format(device.nwk, device.ieee),
            )
            await self._async_device_joined(device, zha_device)

        device_info = async_get_device_info(
            self._hass, zha_device, self.ha_device_registry
        )
        async_dispatcher_send(
            self._hass,
            ZHA_GW_MSG,
            {
                ATTR_TYPE: ZHA_GW_MSG_DEVICE_FULL_INIT,
                ZHA_GW_MSG_DEVICE_INFO: device_info,
            },
        )

    async def _async_device_joined(self, device, zha_device):
        discovery_infos = []
        for endpoint_id, endpoint in device.endpoints.items():
            async_process_endpoint(
                self._hass,
                self._config,
                endpoint_id,
                endpoint,
                discovery_infos,
                device,
                zha_device,
                True,
            )

        await zha_device.async_configure()
        # will cause async_init to fire so don't explicitly call it
        zha_device.update_available(True)

        for discovery_info in discovery_infos:
            async_dispatch_discovery_info(self._hass, True, discovery_info)

    # only public for testing
    async def async_device_restored(self, device):
        """Add an existing device to the ZHA zigbee network when ZHA first starts."""
        zha_device = self._async_get_or_create_device(device)
        discovery_infos = []
        for endpoint_id, endpoint in device.endpoints.items():
            async_process_endpoint(
                self._hass,
                self._config,
                endpoint_id,
                endpoint,
                discovery_infos,
                device,
                zha_device,
                False,
            )

        if zha_device.is_mains_powered:
            # the device isn't a battery powered device so we should be able
            # to update it now
            _LOGGER.debug(
                "attempting to request fresh state for device - %s %s %s",
                "0x{:04x}:{}".format(zha_device.nwk, zha_device.ieee),
                zha_device.name,
                "with power source: {}".format(zha_device.power_source),
            )
            await zha_device.async_initialize(from_cache=False)
        else:
            await zha_device.async_initialize(from_cache=True)

        for discovery_info in discovery_infos:
            async_dispatch_discovery_info(self._hass, False, discovery_info)

    async def _async_device_rejoined(self, zha_device):
        _LOGGER.debug(
            "skipping discovery for previously discovered device - %s",
            "0x{:04x}:{}".format(zha_device.nwk, zha_device.ieee),
        )
        # we don't have to do this on a nwk swap but we don't have a way to tell currently
        await zha_device.async_configure()
        # will cause async_init to fire so don't explicitly call it
        zha_device.update_available(True)

    async def shutdown(self):
        """Stop ZHA Controller Application."""
        _LOGGER.debug("Shutting down ZHA ControllerApplication")
        await self.application_controller.shutdown()


@callback
def async_capture_log_levels():
    """Capture current logger levels for ZHA."""
    return {
        DEBUG_COMP_BELLOWS: logging.getLogger(DEBUG_COMP_BELLOWS).getEffectiveLevel(),
        DEBUG_COMP_ZHA: logging.getLogger(DEBUG_COMP_ZHA).getEffectiveLevel(),
        DEBUG_COMP_ZIGPY: logging.getLogger(DEBUG_COMP_ZIGPY).getEffectiveLevel(),
        DEBUG_COMP_ZIGPY_XBEE: logging.getLogger(
            DEBUG_COMP_ZIGPY_XBEE
        ).getEffectiveLevel(),
        DEBUG_COMP_ZIGPY_DECONZ: logging.getLogger(
            DEBUG_COMP_ZIGPY_DECONZ
        ).getEffectiveLevel(),
        DEBUG_COMP_ZIGPY_ZIGATE: logging.getLogger(
            DEBUG_COMP_ZIGPY_ZIGATE
        ).getEffectiveLevel(),
    }


@callback
def async_set_logger_levels(levels):
    """Set logger levels for ZHA."""
    logging.getLogger(DEBUG_COMP_BELLOWS).setLevel(levels[DEBUG_COMP_BELLOWS])
    logging.getLogger(DEBUG_COMP_ZHA).setLevel(levels[DEBUG_COMP_ZHA])
    logging.getLogger(DEBUG_COMP_ZIGPY).setLevel(levels[DEBUG_COMP_ZIGPY])
    logging.getLogger(DEBUG_COMP_ZIGPY_XBEE).setLevel(levels[DEBUG_COMP_ZIGPY_XBEE])
    logging.getLogger(DEBUG_COMP_ZIGPY_DECONZ).setLevel(levels[DEBUG_COMP_ZIGPY_DECONZ])
    logging.getLogger(DEBUG_COMP_ZIGPY_ZIGATE).setLevel(levels[DEBUG_COMP_ZIGPY_ZIGATE])


class LogRelayHandler(logging.Handler):
    """Log handler for error messages."""

    def __init__(self, hass, gateway):
        """Initialize a new LogErrorHandler."""
        super().__init__()
        self.hass = hass
        self.gateway = gateway

    def emit(self, record):
        """Relay log message via dispatcher."""
        stack = []
        if record.levelno >= logging.WARN:
            if not record.exc_info:
                stack = [f for f, _, _, _ in traceback.extract_stack()]

        entry = LogEntry(record, stack, _figure_out_source(record, stack, self.hass))
        async_dispatcher_send(
            self.hass,
            ZHA_GW_MSG,
            {ATTR_TYPE: ZHA_GW_MSG_LOG_OUTPUT, ZHA_GW_MSG_LOG_ENTRY: entry.to_dict()},
        )
