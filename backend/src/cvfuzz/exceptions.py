class CVFuzzError(Exception):
    """Base exception for expected, user-facing CVFuzz errors."""


class ConfigurationError(CVFuzzError):
    """Raised when a CVFuzz YAML configuration is invalid."""


class ModelAdapterError(CVFuzzError):
    """Raised when a model cannot be loaded or invoked."""


class RunStopped(CVFuzzError):
    """Raised when a user asks an active video run to stop."""
