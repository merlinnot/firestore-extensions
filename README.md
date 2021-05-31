# firestore-extensions

[![Coverage Status](https://coveralls.io/repos/github/merlinnot/firestore-extensions/badge.svg?branch=master&t=6tldvN)](https://coveralls.io/github/merlinnot/firestore-extensions?branch=master)
[![GitHub Actions Status](https://github.com/merlinnot/firestore-extensions/workflows/Continuous%20Integration/badge.svg?branch=master)](https://github.com/merlinnot/firestore-extensions/actions)
[![GitHub Actions Status](https://github.com/merlinnot/firestore-extensions/workflows/Continuous%20Delivery/badge.svg?branch=master)](https://github.com/merlinnot/firestore-extensions/actions)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

A collection of Firestore utilities.

## Quick start

### Installation

```
npm install @merlinnot/firestore-extensions
```

### Usage

#### Firestore ID to UUID converter

An extension provides methods to convert Firestore IDs to UUID v4 and back.

<!-- cspell: disable -->

```typescript
import { idToUuid, uuidToId } from '@merlinnot/firestore-extensions/ids';

const uuid = idToUuid('74NS2s2OIUH5KZRLFto4'); // ef8352da-cd8e-4214-87e4-a6512c5b68e0
const firestoreId = uuidToId('ef8352da-cd8e-4214-87e4-a6512c5b68e0'); // 74NS2s2OIUH5KZRLFto4
```

<!-- cspell: enable -->

#### Subscriptions

An extension that maintains an in memory cache of a Firestore collection's data
with a backing subscription ensuring updates as they occur in the database.

Supports pausing and resuming subscriptions, which can optimize database usage.
These operations are handled automatically, based on attached event listeners
and pending promises. If there are no attached event listeners and no pending
promises, the subscription is paused.

Collections expose methods to learn about the current state and better optimize
usage, such as `isActive` and `statistics`.

##### Listen to data changes

```typescript
import { Repository } from '@merlinnot/firestore-extensions/subscriptions';

const repository = new Repository({ projectId: 'my-project' });

const myCollectionSubscription = repository.makeCollectionSubscription(
  { structuredQuery: { from: [{ collectionId: 'my-collection' }] } },
  (document) => document,
);

myCollectionSubscription.on('documentAdded', (document): void => {
  // Added document data is available here.
});
```

##### Wait for data synchronization

```typescript
import { Repository } from '@merlinnot/firestore-extensions/subscriptions';

const repository = new Repository({ projectId: 'my-project' });

const myCollectionSubscription = repository.makeCollectionSubscription(
  { structuredQuery: { from: [{ collectionId: 'my-collection' }] } },
  (document) => document,
);

await myCollectionSubscription.synchronize();

// Contains current documents.
myCollectionSubscription.data();
```

##### Use filters

```typescript
import { Repository } from '@merlinnot/firestore-extensions/subscriptions';

const repository = new Repository({ projectId: 'my-project' });

const myCollectionSubscription = repository.makeCollectionSubscription(
  {
    structuredQuery: {
      from: [{ collectionId: 'my-collection' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'my-field-path' },
          op: 'EQUAL',
          value: { booleanValue: true },
        },
      },
    },
    },
  },
  (document) => document,
);
```

##### Use projections (field masks)

```typescript
import { Repository } from '@merlinnot/firestore-extensions/subscriptions';

const repository = new Repository({ projectId: 'my-project' });

const myCollectionSubscription = repository.makeCollectionSubscription(
  {
    structuredQuery: {
      from: [{ collectionId: 'my-collection' }],
      select: {
        fields: [{ fieldPath: 'flat' }, { fieldPath: 'nested.field' }],
      },
    },
  },
  (document) => document,
);
```

##### Access statistics

```typescript
import { Repository } from '@merlinnot/firestore-extensions/subscriptions';

const repository = new Repository({ projectId: 'my-project' });

const myCollectionSubscription = repository.makeCollectionSubscription(
  { structuredQuery: { from: [{ collectionId: 'my-collection' }] } },
  (document) => document,
);

const statistics = myCollectionSubscription.statistics();
```

##### Access usage metrics

Firestore usage metrics are collected per subscription. Metrics are reset after
each call to the `metrics()` method. Returned object has to be logged to be used
as a source for log-based metrics.

```typescript
import { Repository } from '@merlinnot/firestore-extensions/subscriptions';

const repository = new Repository({ projectId: 'my-project' });

const myCollectionSubscription = repository.makeCollectionSubscription(
  { structuredQuery: { from: [{ collectionId: 'my-collection' }] } },
  (document) => document,
);

await myCollectionSubscription.synchronize();

const metrics = myCollectionSubscription.metrics();

logInfo(`Subscription synchronized.`, {
  metrics: {
    myCollectionSubscription: myCollectionSubscription.metrics(),
  },
});
```

##### Canonical representation

For best performance, subscriptions default to use the native (API)
representation of documents. This is a recommended way to interact with the
library.

For convenience purposes, especially when migrating existing code, conversion
helpers are provided.

```typescript
import {
  converters,
  Repository,
  types,
} from '@merlinnot/firestore-extensions/subscriptions';

const repository = new Repository({ projectId: 'my-project' });

const myCollectionSubscription = repository.makeCollectionSubscription(
  { structuredQuery: { from: [{ collectionId: 'my-collection' }] } },
  (native: types.ToNativeDocument<MyType>): MyType =>
    converters.toCanonical<MyType>({
      mapValue: { fields: native.fields },
      valueType: 'mapValue',
    }),
);
```

##### Migrating from Firestore SDK

It is possible to convert Firestore SDK references to native query format with
the use of private APIs. This is not recommended, however it can be useful to
run locally when migrating.

```typescript
import { Firestore } from '@google-cloud/firestore';
import { google } from '@google-cloud/firestore/types/protos/firestore_v1_proto_api';
import { Repository } from '@merlinnot/firestore-extensions/subscriptions';

const firestore = new Firestore();
const reference = (
  firestore.collection('my-collection') as unknown as {
    toProto: () => google.firestore.v1.IRunQueryRequest;
  }
).toProto();

// Log the structured query.
console.log(reference.structuredQuery);

// Use directly (not recommended in production environments).
const repository = new Repository({ projectId: 'my-project' });
const subscription = repository.makeCollectionSubscription(
  reference,
  (document) => document,
);
```

## Getting started

These instructions will get you a copy of the project up and running on your
local machine for development and testing purposes. See usage notes on how to
consume this package in your project.

### Prerequisites

Minimal requirements to set up the project:

- [Node.js](https://nodejs.org/en) v16, installation instructions can be found
  on the official website, a recommended installation option is to use
  [Node Version Manager](https://github.com/creationix/nvm#readme). It can be
  installed in a
  [few commands](https://nodejs.org/en/download/package-manager/#nvm).
- A package manager [npm](https://www.npmjs.com). All instructions in the
  documentation will follow the npm syntax.
- Optionally a [Git](https://git-scm.com) client.

### Installing

Start by cloning the repository:

```bash
git clone git@github.com:merlinnot/firestore-extensions.git
```

In case you don't have a git client, you can get the latest version directly by
using
[this link](https://github.com/merlinnot/firestore-extensions/archive/master.zip)
and extracting the downloaded archive.

Go the the right directory and install dependencies:

```bash
cd ./firestore-extensions
npm install
```

That's it! You can now go to the next step.

## Tests

### Formatting

This project uses [Prettier](https://prettier.io) to automate formatting. All
supported files are being reformatted in a pre-commit hook. You can also use one
of the two scripts to validate and optionally fix all of the files:

```bash
npm run format
npm run format:fix
```

### Linting

This project uses [ESLint](https://eslint.org) to enable static analysis.
TypeScript files are linted using a [custom configuration](./.eslintrc). You can
use one of the following scripts to validate and optionally fix all of the
files:

```bash
npm run lint
npm run lint:fix
```

### Coverage

[Coveralls.io](https://coveralls.io)

## Publishing

Publishing is handled in an automated way and must not be performed manually.

Each commit to the master branch is automatically deployed to the NPM registry
with a version specified in `package.json`. All other commits are published as
pre-releases.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Built with

### Runtime libraries

### Automation

- [GitHub Actions](https://github.com/features/actions)
- [Dependabot](https://dependabot.com/)

### Source

- [TypeScript](https://www.typescriptlang.org)

## Versioning

This project adheres to [Semantic Versioning](http://semver.org) v2.
