from __future__ import annotations

from collections.abc import Callable
from typing import Any

from cvfuzz.config import BoundaryConfig
from cvfuzz.types import BoundaryResult, Failure

Evaluator = Callable[[dict[str, Any]], Failure | None]


class BoundarySearcher:
    def __init__(self, config: BoundaryConfig) -> None:
        self.config = config

    def search(
        self,
        *,
        transform: str,
        levels: list[dict[str, Any]],
        search_parameter: str,
        evaluator: Evaluator,
        supports_refinement: bool = True,
        initial_passing_parameters: dict[str, Any] | None = None,
    ) -> BoundaryResult:
        evaluations = 0
        last_passing = (
            initial_passing_parameters.copy() if initial_passing_parameters is not None else None
        )
        first_failing: dict[str, Any] | None = None
        failure: Failure | None = None

        for parameters in levels:
            current_failure = evaluator(parameters)
            evaluations += 1
            if current_failure is None:
                last_passing = parameters.copy()
                continue
            first_failing = parameters.copy()
            failure = current_failure
            break

        if first_failing is None:
            return BoundaryResult(False, transform, None, last_passing, None, evaluations)

        can_refine = (
            self.config.refine
            and supports_refinement
            and last_passing is not None
            and isinstance(last_passing[search_parameter], (int, float))
            and isinstance(first_failing[search_parameter], (int, float))
        )
        if can_refine:
            passing_value = float(last_passing[search_parameter])
            failing_value = float(first_failing[search_parameter])
            fixed = {key: value for key, value in first_failing.items() if key != search_parameter}
            for _ in range(self.config.max_iterations):
                if abs(failing_value - passing_value) <= self.config.tolerance:
                    break
                midpoint = (passing_value + failing_value) / 2.0
                candidate = {**fixed, search_parameter: midpoint}
                current_failure = evaluator(candidate)
                evaluations += 1
                if current_failure is None:
                    passing_value = midpoint
                    last_passing = candidate.copy()
                else:
                    failing_value = midpoint
                    first_failing = candidate.copy()
                    failure = current_failure

        return BoundaryResult(
            True,
            transform,
            first_failing,
            last_passing,
            failure,
            evaluations,
        )
