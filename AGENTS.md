# CVFuzz repository instructions

## Operating CVFuzz

For requests to use, run, serve, deploy, inspect, or troubleshoot the CVFuzz platform, read
`skills/cvfuzz-operations/SKILL.md` before acting. It routes between the CLI, native
web-development, and Docker Compose workflows and records the operational safety constraints.

## Project scope

- The current implementation is a Python 3.11 backend and CLI under `backend/`.
- Keep inference, transformations, failure detection, search, execution, and storage independent
  from future API and UI layers.
- Keep model-specific behavior behind adapters in `backend/src/cvfuzz/models/`.
- Keep transformation parameters user-configurable through versioned YAML.
- Preserve local-first operation. Do not introduce a database or network service unless a
  feature explicitly requires one.
- Do not commit model weights, downloaded videos, virtual environments, caches, or generated run
  artifacts.

## Development workflow

1. Use Python 3.11 and the virtual environment at `backend/.venv`.
2. Implement changes in small, focused units with tests.
3. Validate YAML schema changes against both configurations in `backend/configs/`.
4. Before completing a feature, run from `backend/`:

   ```bash
   ruff check .
   pytest
   ```

5. Review `git status` and `git diff` to ensure generated assets, credentials, and unrelated
   changes are not included.

## Git delivery workflow

After a feature or coherent unit of work is implemented and verified:

1. Work from the `main` branch unless the user explicitly requests another branch or pull-request
   workflow.
2. Create one or more clear, logical commits using imperative commit messages.
3. Push the completed commits to `origin/main` so GitHub remains the current project backup.
4. Report the commit identifiers and push result to the user.

Do not force-push, rewrite published history, commit secrets, or bypass failing checks. If the
user explicitly asks not to commit or push a particular change, that instruction takes
precedence.
