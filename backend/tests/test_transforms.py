import numpy as np
import pytest

from cvfuzz.transforms import TransformContext, get_transform, list_transforms


@pytest.fixture
def image() -> np.ndarray:
    values = np.linspace(0, 255, 96 * 128 * 3, dtype=np.uint8)
    return values.reshape((96, 128, 3))


@pytest.mark.parametrize(
    ("name", "parameters"),
    [
        ("exposure", {"stops": -1}),
        ("low_light", {"stops": -1, "noise_std": 4}),
        ("motion_blur", {"kernel_size": 7, "angle_degrees": 45}),
        ("defocus_blur", {"sigma": 2}),
        ("jpeg_compression", {"quality": 40}),
        ("resolution_degradation", {"scale": 0.4, "interpolation": "area"}),
        ("fog", {"strength": 0.5}),
        ("glare", {"intensity": 0.5, "radius_fraction": 0.2}),
    ],
)
def test_transform_preserves_image_contract(
    image: np.ndarray,
    name: str,
    parameters: dict[str, object],
) -> None:
    output = get_transform(name).apply(image, parameters, TransformContext(seed=42))

    assert output.shape == image.shape
    assert output.dtype == np.uint8
    assert not np.shares_memory(output, image)


def test_stochastic_transform_is_reproducible(image: np.ndarray) -> None:
    transform = get_transform("low_light")
    parameters = {"stops": -2, "noise_std": 8}

    left = transform.apply(image, parameters, TransformContext(seed=123))
    right = transform.apply(image, parameters, TransformContext(seed=123))

    np.testing.assert_array_equal(left, right)


def test_partial_occlusion_changes_target_region_only() -> None:
    image = np.full((100, 100, 3), 200, dtype=np.uint8)
    output = get_transform("partial_occlusion").apply(
        image,
        {"fraction": 0.5, "position": "center", "color": "black"},
        TransformContext(seed=42, target_box=(20, 20, 80, 80)),
    )

    assert np.all(output[:15] == 200)
    assert np.any(output[20:80, 20:80] == 0)


def test_registry_contains_expected_transforms() -> None:
    assert set(list_transforms()) == {
        "defocus_blur",
        "exposure",
        "fog",
        "glare",
        "jpeg_compression",
        "low_light",
        "motion_blur",
        "partial_occlusion",
        "resolution_degradation",
    }
