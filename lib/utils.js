'use strict';
/**
 * Utilities and helpers
 */

const _ = require('lodash');

class Utils {

	/**
	 * Find all given references in an object and return the paths to the
	 * enclosing object.
	 * @param root {Object} Start object
	 * @param references {Array<String>} References to search for
	 * @returns {Array<String>} Paths where the references are found
	 */
	static findReferences(root, references) {
		const resourcePaths = [];
		const stack = [ { parent: null, value: root, path:'' } ];

		while (!_.isEmpty(stack)) {
			const property = stack.pop();

			_.forOwn(property.value, (value, key) => {
				if (key === 'Ref' && _.includes(references, value) ||
						key === 'Fn::GetAtt' && _.includes(references, value[0])) {
					resourcePaths.push(property.path);
				} else if (_.isObject(value)) {
					key = _.isArray(property.value) ? `[${key}]` : (_.isEmpty(property.path) ? `${key}` : `.${key}`);
					stack.push({ parent: property, value, path: `${property.path}${key}` });
				}
			});
		}

		return resourcePaths;
	}

	/**
	 * Find AWS CF references in an object and return the referenced resources, including
	 * the referenced resource and the enclosing object of the reference.
	 * The referencing object can directly be retrieved with _.get(root, reference.path)
	 * @param root {Object} Start object
	 * @returns {Array<Object>} Found references as { ref: "", path: "" }
	 */
	static findAllReferences(root) {
		const resourceRefs = [];
		const stack = [ { parent: null, value: root, path: '' } ];

		while (!_.isEmpty(stack)) {
			const property = stack.pop();

			_.forOwn(property.value, (value, key) => {
				if (key === 'Ref') {
					resourceRefs.push({ ref: value, path: property.path });
				} else if (key === 'Fn::GetAtt') {
					resourceRefs.push({ ref: value[0], path: property.path });
				} else if (_.isObject(value)) {
					key = _.isArray(property.value) ? `[${key}]` : (_.isEmpty(property.path) ? `${key}` : `.${key}`);
					stack.push({ parent: property, value, path: `${property.path}${key}` });
				}
			});
		}

		return resourceRefs;
	}

}

module.exports = Utils;