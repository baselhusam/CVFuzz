from cvfuzz.config import BoundaryConfig, FailureConfig
from cvfuzz.failures import FailureDetector
from cvfuzz.search import BoundarySearcher
from cvfuzz.types import Detection


def detection(*, confidence: float = 0.9, class_id: int = 0) -> Detection:
    return Detection((10, 10, 50, 50), class_id, "person" if class_id == 0 else "car", confidence)


def test_failure_detector_reports_confidence_collapse() -> None:
    detector = FailureDetector(FailureConfig(confidence_drop_fraction=0.5))

    failure = detector.evaluate(detection(), [detection(confidence=0.4)])

    assert failure is not None
    assert failure.kind == "confidence_collapse"


def test_failure_detector_reports_class_flip() -> None:
    detector = FailureDetector(FailureConfig())

    failure = detector.evaluate(detection(), [detection(confidence=0.8, class_id=1)])

    assert failure is not None
    assert failure.kind == "class_flip"


def test_failure_detector_reports_localization_drift() -> None:
    detector = FailureDetector(FailureConfig(match_iou=0.2, localization_iou=0.5))
    shifted = Detection((25, 10, 65, 50), 0, "person", 0.8)

    failure = detector.evaluate(detection(), [shifted])

    assert failure is not None
    assert failure.kind == "localization_drift"


def test_boundary_search_refines_numeric_failure() -> None:
    searcher = BoundarySearcher(BoundaryConfig(refine=True, tolerance=0.01, max_iterations=12))
    baseline = detection()

    def evaluate(parameters: dict[str, float]):
        if parameters["strength"] < 0.63:
            return None
        return FailureDetector(FailureConfig()).evaluate(baseline, [])

    result = searcher.search(
        transform="fog",
        levels=[{"strength": 0.2}, {"strength": 0.5}, {"strength": 0.8}],
        search_parameter="strength",
        evaluator=evaluate,
    )

    assert result.found
    assert result.parameters is not None
    assert 0.63 <= result.parameters["strength"] <= 0.64
    assert result.last_passing_parameters is not None
    assert result.last_passing_parameters["strength"] < 0.63


def test_boundary_search_refines_against_identity_when_first_level_fails() -> None:
    searcher = BoundarySearcher(BoundaryConfig(refine=True, tolerance=0.01, max_iterations=12))
    baseline = detection()

    def evaluate(parameters: dict[str, float]):
        if parameters["strength"] < 0.1:
            return None
        return FailureDetector(FailureConfig()).evaluate(baseline, [])

    result = searcher.search(
        transform="fog",
        levels=[{"strength": 0.2}, {"strength": 0.4}],
        search_parameter="strength",
        evaluator=evaluate,
        initial_passing_parameters={"strength": 0.0},
    )

    assert result.found
    assert result.parameters is not None
    assert 0.1 <= result.parameters["strength"] <= 0.11
