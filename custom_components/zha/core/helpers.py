"""
Helpers for Zigbee Home Automation.

For more details about this component, please refer to the documentation at
https://home-assistant.io/integrations/zha/
"""
import asyncio
import collections
import logging

import bellows.ezsp
import bellows.zigbee.application
import zigpy.types
import zigpy_deconz.api
import zigpy_deconz.zigbee.application
import zigpy_xbee.api
import zigpy_xbee.zigbee.application
import zigpy_zigate.api
import zigpy_zigate.zigbee.application

from homeassistant.core import callback

from .const import (
    CLUSTER_TYPE_IN,
    CLUSTER_TYPE_OUT,
    DATA_ZHA,
    DATA_ZHA_GATEWAY,
    DEFAULT_BAUDRATE,
    RadioType,
)
from .registries import BINDABLE_CLUSTERS

_LOGGER = logging.getLogger(__name__)

ClusterPair = collections.namedtuple("ClusterPair", "source_cluster target_cluster")


async def safe_read(
    cluster, attributes, allow_cache=True, only_cache=False, manufacturer=None
):
    """Swallow all exceptions from network read.

    If we throw during initialization, setup fails. Rather have an entity that
    exists, but is in a maybe wrong state, than no entity. This method should
    probably only be used during initialization.
    """
    try:
        result, _ = await cluster.read_attributes(
            attributes,
            allow_cache=allow_cache,
            only_cache=only_cache,
            manufacturer=manufacturer,
        )
        return result
    except Exception:  # pylint: disable=broad-except
        return {}


async def check_zigpy_connection(usb_path, radio_type, database_path):
    """Test zigpy radio connection."""
    if radio_type == RadioType.ezsp.name:
        radio = bellows.ezsp.EZSP()
        ControllerApplication = bellows.zigbee.application.ControllerApplication
    elif radio_type == RadioType.xbee.name:
        radio = zigpy_xbee.api.XBee()
        ControllerApplication = zigpy_xbee.zigbee.application.ControllerApplication
    elif radio_type == RadioType.deconz.name:
        radio = zigpy_deconz.api.Deconz()
        ControllerApplication = zigpy_deconz.zigbee.application.ControllerApplication
    elif radio_type == RadioType.zigate.name:
        radio = zigpy_zigate.api.ZiGate()
        ControllerApplication = zigpy_zigate.zigbee.application.ControllerApplication
    try:
        await radio.connect(usb_path, DEFAULT_BAUDRATE)
        controller = ControllerApplication(radio, database_path)
        await asyncio.wait_for(controller.startup(auto_form=True), timeout=30)
        await controller.shutdown()
    except Exception:  # pylint: disable=broad-except
        return False
    return True


def get_attr_id_by_name(cluster, attr_name):
    """Get the attribute id for a cluster attribute by its name."""
    return next(
        (
            attrid
            for attrid, (attrname, datatype) in cluster.attributes.items()
            if attr_name == attrname
        ),
        None,
    )


async def get_matched_clusters(source_zha_device, target_zha_device):
    """Get matched input/output cluster pairs for 2 devices."""
    source_clusters = source_zha_device.async_get_std_clusters()
    target_clusters = target_zha_device.async_get_std_clusters()
    clusters_to_bind = []

    for endpoint_id in source_clusters:
        for cluster_id in source_clusters[endpoint_id][CLUSTER_TYPE_OUT]:
            if cluster_id not in BINDABLE_CLUSTERS:
                continue
            for t_endpoint_id in target_clusters:
                if cluster_id in target_clusters[t_endpoint_id][CLUSTER_TYPE_IN]:
                    cluster_pair = ClusterPair(
                        source_cluster=source_clusters[endpoint_id][CLUSTER_TYPE_OUT][
                            cluster_id
                        ],
                        target_cluster=target_clusters[t_endpoint_id][CLUSTER_TYPE_IN][
                            cluster_id
                        ],
                    )
                    clusters_to_bind.append(cluster_pair)
    return clusters_to_bind


@callback
def async_is_bindable_target(source_zha_device, target_zha_device):
    """Determine if target is bindable to source."""
    source_clusters = source_zha_device.async_get_std_clusters()
    target_clusters = target_zha_device.async_get_std_clusters()

    for endpoint_id in source_clusters:
        for t_endpoint_id in target_clusters:
            matches = set(
                source_clusters[endpoint_id][CLUSTER_TYPE_OUT].keys()
            ).intersection(target_clusters[t_endpoint_id][CLUSTER_TYPE_IN].keys())
            if any(bindable in BINDABLE_CLUSTERS for bindable in matches):
                return True
    return False


async def async_get_zha_device(hass, device_id):
    """Get a ZHA device for the given device registry id."""
    device_registry = await hass.helpers.device_registry.async_get_registry()
    registry_device = device_registry.async_get(device_id)
    zha_gateway = hass.data[DATA_ZHA][DATA_ZHA_GATEWAY]
    ieee_address = list(list(registry_device.identifiers)[0])[1]
    ieee = zigpy.types.EUI64.convert(ieee_address)
    return zha_gateway.devices[ieee]


class LogMixin:
    """Log helper."""

    def log(self, level, msg, *args):
        """Log with level."""
        raise NotImplementedError

    def debug(self, msg, *args):
        """Debug level log."""
        return self.log(logging.DEBUG, msg, *args)

    def info(self, msg, *args):
        """Info level log."""
        return self.log(logging.INFO, msg, *args)

    def warning(self, msg, *args):
        """Warning method log."""
        return self.log(logging.WARNING, msg, *args)

    def error(self, msg, *args):
        """Error level log."""
        return self.log(logging.ERROR, msg, *args)
