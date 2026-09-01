# Frontend structure guide

## At a glance

The frontend is logically organized and component-based. Angular does not require
a directory named `components/`: components can live beside the feature or
infrastructure that owns them.

```text
src/app/
├── core/       Application-wide UI and infrastructure
├── features/   Business features and their private components
├── shared/     Domain-neutral code reused across features
├── services/   Older/global services that have not all moved to an owner yet
├── models/     Remaining application-level models
├── guards/     Route authorization rules
└── static and public pages
```

The current structure is professional enough for a learning project. Its main
strength is clear ownership, not the number of directories.

## Why `components/` is empty

Angular being component-based means that the interface is assembled from Angular
components. It does not mean that every component belongs in one global folder.

```text
Application shell
├── Navigation component
├── Search component
├── Player component
└── Routed page
    ├── Page-specific component
    └── Reusable child components
```

Angular recognizes a component through its decorator and imports:

```ts
@Component({
  selector: 'app-album-card',
  templateUrl: './album-card.html',
})
export class AlbumCard {}
```

The folder name has no effect on whether something is an Angular component.

Our components now live with their natural owners:

```text
core/player/progression-bar/
features/social/ui/social-chat/
features/catalog/ui/fresh-picks/
shared/ui/album-card/
```

This is clearer than one large global bucket:

```text
components/
├── album-card/
├── navigation/
├── social-chat/
├── upload-form/
└── profile/
```

A global bucket makes ownership difficult to understand. It becomes unclear which
feature owns a component, who may import it, and what could break when it changes.

The remaining empty `src/app/components/` directory is legacy structure and can be
deleted. Removing it makes clear that the components were reorganized, not lost.

## What each main directory means

### `core/`

`core/` contains code that supports the entire application or persists while the
user navigates between features.

```text
core/
├── auth/       Login and signup building blocks
├── layout/     Navigation, sidebar, and profile layout
├── player/     Persistent playback controls
└── shell/      Main authenticated application shell
```

The player belongs here because it must survive route navigation. It is not owned
by the home, album, or library page.

### `features/`

`features/` contains business capabilities. Each feature should own as much of its
UI, state, models, data access, and workflow coordination as practical.

```text
features/
├── admin/
├── audio/
├── catalog/
├── library/
├── settings/
├── social/
└── upload/
```

Examples of correct ownership:

```text
features/catalog/ui/fresh-picks/
features/library/ui/song-list/
features/social/ui/social-chat/
features/upload/ui/upload-album-form/
```

A social chat component belongs to social. An upload form belongs to upload. They
are Angular components without needing to live in a global `components/` folder.

### `shared/`

`shared/` contains small, domain-neutral pieces that are genuinely reusable across
multiple areas.

```text
shared/
├── ui/
│   └── album-card/
└── utils/
    └── storage-url.ts
```

Keeping this directory small is healthy. Code should not move into `shared/` merely
because its owner is uncertain. It should be shared only when reuse or neutrality
is clear.

### `services/` and `models/`

These directories currently form the transitional part of the architecture:

```text
services/
├── album.service.ts
├── artist.service.ts
├── audio.player.service.ts
├── auth.service.ts
├── playlist.service.ts
└── ...

models/
├── auth.model.ts
└── chat.model.ts
```

The services are tested and currently have clearer dependency boundaries. Some
could eventually move closer to their feature, but this is architectural polish,
not an urgent safety problem.

## How responsibilities flow

The intended direction is:

```text
Page component
    ├── reads state
    ├── displays feature components
    └── delegates user actions
             │
             ▼
       Facade or store
             │
             ▼
       Data-access service
             │
             ▼
       Backend API or WebSocket
```

Components should usually present state and forward user actions. They should not
own unrelated polling, socket reconciliation, optimistic state, API sequencing,
and browser lifecycles all at once.

The Social feature demonstrates this separation:

```text
features/social/
├── social.ts                 Page and UI coordination
├── social.facade.ts          Feature workflow coordination
├── state/
│   ├── friends.store.ts
│   ├── conversations.store.ts
│   └── social-reconciliation.ts
├── data-access/
│   ├── social-api.service.ts
│   └── chat-socket.service.ts
└── ui/
    ├── social-chat/
    ├── social-share-card/
    └── social-side-bar/
```

This reduces the chance that a small visual change breaks polling, messaging, or
conversation reconciliation.

## Good Angular practices reflected here

### Feature ownership

Most UI now lives inside the feature that owns its behavior. Contributors can find
related files without searching the entire application.

### Standalone and lazy-loaded components

Routes use `loadComponent`, so pages are loaded when they are needed instead of all
being placed in the initial application bundle.

### Thin page components

Complex workflows have started moving into facades, stores, orchestrators, and
data-access services. Examples include Social, album detail, upload, and playback.

### Separate external communication

Social HTTP calls and WebSocket behavior have explicit data-access owners. Upload
API calls and multi-step upload orchestration are also separated.

### Testable state and workflows

State reconciliation, stores, API contracts, routes, and upload workflows have
focused tests outside large UI components.

### Enforced dependency direction

`architecture.spec.ts` prevents important structural regressions, including shared
code importing features and feature UI reaching into another feature's UI.

## Remaining non-urgent inconsistencies

### The global service directory is still broad

Some services could eventually move closer to their owners:

```text
features/catalog/data-access/
├── album-api.service.ts
├── artist-api.service.ts
└── search-api.service.ts

features/library/state/
└── playlist.store.ts

core/auth/
├── auth.service.ts
└── auth.interceptor.ts

core/player/
├── audio-player.service.ts
└── volume.service.ts
```

This should be done only when useful, progressively, and with tests. Another large
folder migration is not currently necessary.

### Root models still have clearer possible owners

`auth.model.ts` could eventually belong to core authentication. `chat.model.ts`
could belong to the Social feature.

### Naming is not completely uniform

The project uses concise filenames such as `social.ts`, `home.ts`, and
`album-detail.ts`. More explicit names can help beginners:

```text
social-page.component.ts
home-page.component.ts
album-detail.component.ts
album-detail.facade.ts
```

Both styles work. Consistency matters more than the suffix itself.

`bside_app` is the clearest naming exception because it uses snake case. A future
cosmetic cleanup could rename it to `app-shell`, but that is not behavior-critical.

### Page folders could become more explicit if features grow

The Catalog feature currently has direct page directories:

```text
catalog/
├── home/
├── album-detail/
└── artist-detail/
```

If Catalog becomes much larger, these could be grouped under `pages/`. Doing this
today would add nesting without delivering much practical value.

## Where new code should go

Use these questions in order:

1. **Is it used by one feature?** Put it inside that feature.
2. **Is it domain-neutral and reused by several features?** Put it in `shared/`.
3. **Does it live for the whole application?** Put it in `core/`.
4. **Does it call one feature's backend endpoints?** Put it in that feature's
   `data-access/` directory.
5. **Does it coordinate a multi-step feature workflow?** Put it in a facade, store,
   or feature service rather than a visual component.

Examples:

| New code | Owner |
|---|---|
| Conversation unread badge | `features/social/` |
| Generic button | `shared/ui/` |
| Authentication interceptor | `core/auth/` |
| Album API request | `features/catalog/data-access/` |
| Upload sequence and cleanup | `features/upload/services/` |
| Persistent player control | `core/player/` |

## Team rules

- Keep feature-specific code inside its feature.
- Do not use `shared/` as a miscellaneous folder.
- Let components focus on presentation and user interaction.
- Move complex asynchronous workflows into a facade, store, or service.
- Keep backend calls in data-access services where practical.
- Preserve one-way dependencies: features may use core and shared; core and shared
  should not depend on feature UI.
- Add a focused test when moving or changing meaningful behavior.
- Run TypeScript, tests, the architecture checks, and the production SSR build after
  structural changes.

## Overall assessment

| Question | Assessment |
|---|---|
| Is it logically organized? | Yes |
| Is it component-based? | Yes |
| Is it feature-oriented? | Yes |
| Is it understandable to a new contributor? | Mostly yes |
| Does it look professional? | Yes, with transitional inconsistencies |
| Is it overengineered? | No |

The architecture is successful because responsibilities have recognizable owners,
dependencies mostly move in one direction, complex workflows can be tested outside
components, and structural rules are automatically checked.

The project does not need a global `components/` directory to be component-based.
Its components are now placed beside the feature or infrastructure that owns them,
which is generally easier to maintain as an Angular application grows.
