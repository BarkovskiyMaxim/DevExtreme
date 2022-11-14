// eslint-disable-next-line no-restricted-imports
import ko from 'knockout';
import errors from '../core/errors';
import { compare as compareVersion } from '../core/utils/version';
import { registerKo } from './knockout_reg';
// Check availability in global environment
if(ko) {
    if(compareVersion(ko.version, [2, 3]) < 0) {
        throw errors.Error('E0013');
    }
    registerKo(ko);
}
