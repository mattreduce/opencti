import type { StoreEntity } from '../types/store';
import type { RelationDefinition } from '../database/stix';
import { stixCoreRelationshipsMapping as coreRels } from '../database/stix';
import type { ConvertFn, RepresentativeFn } from '../database/stix-converter';
import {
  registerStixDomainConverter,
  registerStixMetaConverter,
  registerStixRepresentativeConverter
} from '../database/stix-converter';
import { registerGraphqlSchema } from '../graphql/schema';
import {
  ABSTRACT_INTERNAL_OBJECT,
  ABSTRACT_STIX_DOMAIN_OBJECT,
  ABSTRACT_STIX_META_OBJECT,
  ABSTRACT_STIX_META_RELATIONSHIP,
  ENTITY_TYPE_CONTAINER,
  ENTITY_TYPE_LOCATION,
} from './general';
import { UnsupportedError } from '../config/errors';
import {
  AttributeDefinition,
  confidence,
  iAliasedIds,
  lang,
  revoked,
  standardId,
  xOpenctiStixIds
} from './attribute-definition';
import { depsKeysRegister, schemaAttributesDefinition } from './schema-attributes';
import { STIX_CORE_RELATIONSHIPS } from './stixCoreRelationship';
import type { ValidatorFn } from './validator-register';
import { registerEntityValidator } from './validator-register';
import type { Resolvers } from '../generated/graphql';
import { schemaRelationsRefDefinition } from './schema-relationsRef';
import {
  isStixDomainObject,
  registerStixDomainAliased,
  resolveAliasesField
} from './stixDomainObject';
import { registerInternalObject } from './internalObject';
import { registerModelIdentifier } from './identifier';
import type { StixObject } from '../types/stix-common';
import type { RelationRefDefinition } from './relationRef-definition';

export interface ModuleDefinition<T extends StoreEntity, Z extends StixObject> {
  type: {
    id: string
    name: string
    aliased?: boolean
    category: 'Container' | 'Location' | 'Stix-Domain-Object' | 'Stix-Meta-Object' | 'Internal-Object'
  };
  graphql: {
    schema: any
    resolver: Resolvers
  };
  identifier: {
    definition: {
      [k: string]: Array<{ src: string }> | (() => string)
    };
    resolvers?: {
      [f: string]: (data: object) => string
    };
  };
  representative: RepresentativeFn<Z>
  converter: ConvertFn<T, Z>
  attributes: Array<AttributeDefinition>
  relations: Array<{
    name: string;
    targets: Array<RelationDefinition>
  }>;
  relationsRefs?: RelationRefDefinition[]
  validators?: {
    validatorCreation?: ValidatorFn
    validatorUpdate?: ValidatorFn
  }
  depsKeys?: { src: string, types?: string[] }[]
}

export const registerDefinition = <T extends StoreEntity, Z extends StixObject>(definition: ModuleDefinition<T, Z>) => {
  // Register types
  if (definition.type.category) {
    switch (definition.type.category) {
      case ENTITY_TYPE_LOCATION:
        schemaAttributesDefinition.add(ENTITY_TYPE_LOCATION, definition.type.name);
        schemaAttributesDefinition.add(ABSTRACT_STIX_DOMAIN_OBJECT, definition.type.name);
        registerStixDomainConverter(definition.type.name, definition.converter);
        break;
      case ENTITY_TYPE_CONTAINER:
        schemaAttributesDefinition.add(ENTITY_TYPE_CONTAINER, definition.type.name);
        schemaAttributesDefinition.add(ABSTRACT_STIX_DOMAIN_OBJECT, definition.type.name);
        registerStixDomainConverter(definition.type.name, definition.converter);
        break;
      case ABSTRACT_STIX_DOMAIN_OBJECT:
        schemaAttributesDefinition.add(ABSTRACT_STIX_DOMAIN_OBJECT, definition.type.name);
        registerStixDomainConverter(definition.type.name, definition.converter);
        break;
      case ABSTRACT_STIX_META_OBJECT:
        schemaAttributesDefinition.add(ABSTRACT_STIX_META_OBJECT, definition.type.name);
        registerStixMetaConverter(definition.type.name, definition.converter);
        break;
      case ABSTRACT_INTERNAL_OBJECT:
        schemaAttributesDefinition.add(ABSTRACT_INTERNAL_OBJECT, definition.type.name);
        registerInternalObject(definition.type.name);
        break;
      default:
        throw UnsupportedError('Unsupported category');
    }
    if (definition.type.aliased) {
      registerStixDomainAliased(definition.type.name);
    }
  }

  // Register representative
  registerStixRepresentativeConverter(definition.type.name, definition.representative);

  // Register validator
  if (definition.validators) {
    registerEntityValidator(definition.type.name, definition.validators);
  }

  // Register graphQL schema
  registerGraphqlSchema(definition.graphql);

  // Register key identification
  registerModelIdentifier(definition.identifier);

  // Register model attributes
  const attributes: AttributeDefinition[] = [standardId];
  attributes.push(...definition.attributes.map((attr) => attr));
  if (definition.type.aliased) {
    attributes.push(...[resolveAliasesField(definition.type.name), iAliasedIds]);
  }
  if (isStixDomainObject(definition.type.category)) {
    attributes.push(...[xOpenctiStixIds, revoked, confidence, lang]);
  }
  schemaAttributesDefinition.registerAttributes(definition.type.name, attributes);

  // Register dependency keys for input resolved refs
  if (definition.depsKeys) {
    depsKeysRegister.add(definition.depsKeys);
  }

  // Register relations
  definition.relations.forEach((source) => {
    STIX_CORE_RELATIONSHIPS.push(source.name);
    source.targets.forEach((target) => {
      const key: `${string}_${string}` = `${definition.type.name}_${target.name}`;
      coreRels[key] = [...(coreRels[key] ?? []), { name: source.name, type: target.type }];
    });
  });

  // Register relations ref
  if (definition.relationsRefs) {
    schemaRelationsRefDefinition.registerRelationsRef(definition.type.name, definition.relationsRefs);
    definition.relationsRefs?.forEach((source) => {
      schemaAttributesDefinition.add(ABSTRACT_STIX_META_RELATIONSHIP, source.databaseName);
    });
  }
};