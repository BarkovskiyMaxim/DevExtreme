import { ko_template } from './knockout/template';
import { ko_utils } from './knockout/utils';
import { component_registrator } from './knockout/component_registrator';
import { event_registrator } from './knockout/event_registrator';
import { components } from './knockout/components';
import { validation } from './knockout/validation';
import { variable_wrapper_utils } from './knockout/variable_wrapper_utils';
import { clear_node } from './knockout/clean_node';
import { clear_node_old } from './knockout/clean_node_old';

export function registerKo(_ko) {
    ko_template(_ko);
    ko_utils(_ko);
    component_registrator(_ko);
    event_registrator(_ko);
    components(_ko);
    validation(_ko);
    variable_wrapper_utils(_ko);
    clear_node(_ko);
    clear_node_old(_ko);
}
