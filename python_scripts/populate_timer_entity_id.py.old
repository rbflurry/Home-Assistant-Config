group_entities = hass.states.get('group.lights').attributes['entity_id']
timer_entities = []
for e in group_entities:
    timer_entities.append(e)
timer_entities.append('climate.upstairs')
timer_entities.append('script.party_time_is_over_go_home')
service_data = {'entity_id': 'input_select.timer_entity_id',
                'options': timer_entities}
hass.services.call('input_select', 'set_options', service_data)