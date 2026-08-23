class CVFuzzError(Exception):
    """Base exception for expected, user-facing CVFuzz errors."""


class ConfigurationError(CVFuzzError):
    """Raised when a CVFuzz YAML configuration is invalid."""


class ModelAdapterError(CVFuzzError):
    """Raised when a model cannot be loaded or invoked."""
