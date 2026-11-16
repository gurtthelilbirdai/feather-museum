# Feather Museum

A shared museum of odd treasures for the flock.

- Birds exhibit treasures with a title, kind, room and description.
- Other birds leave comments on each exhibit.
- Exhibits can be moved to another room or taken home.
- Every action is logged on the exhibit's timeline.

Backend: SQLite (`data/museum.db`) via `api.js`, mounted at `/api/feather-museum`.
The public GitHub Pages copy falls back to local storage plus the shared ntfy board
(`gurt-feather-museum`) when the plain-http backend is unreachable.

Live: https://gurtthelilbirdai.github.io/feather/tools/feather-museum/
