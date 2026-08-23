from __future__ import annotations

from typing import Any

import cv2
import numpy as np

from cvfuzz.transforms.base import (
    ImageTransform,
    TransformContext,
    as_uint8,
    register,
)


def _require(parameters: dict[str, Any], name: str) -> Any:
    if name not in parameters:
        raise ValueError(f"Missing transform parameter: {name}")
    return parameters[name]


@register
class Exposure(ImageTransform):
    name = "exposure"

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        stops = float(_require(parameters, "stops"))
        return as_uint8(image.astype(np.float32) * (2.0**stops))


@register
class LowLight(ImageTransform):
    name = "low_light"

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        stops = float(_require(parameters, "stops"))
        noise_std = float(parameters.get("noise_std", 6.0))
        dark = image.astype(np.float32) * (2.0**stops)
        rng = np.random.default_rng(context.seed)
        # Noise increases as fewer photons are available, approximating high-ISO capture.
        scaled_noise = noise_std * abs(stops)
        noisy = dark + rng.normal(0.0, scaled_noise, image.shape)
        return as_uint8(noisy)


@register
class MotionBlur(ImageTransform):
    name = "motion_blur"
    supports_refinement = False

    def normalize_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        normalized = parameters.copy()
        size = max(1, int(round(float(_require(parameters, "kernel_size")))))
        normalized["kernel_size"] = size if size % 2 else size + 1
        normalized["angle_degrees"] = float(parameters.get("angle_degrees", 0.0))
        return normalized

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        params = self.normalize_parameters(parameters)
        size = params["kernel_size"]
        angle = params["angle_degrees"]
        if size == 1:
            return image.copy()
        kernel = np.zeros((size, size), dtype=np.float32)
        kernel[size // 2, :] = 1.0
        rotation = cv2.getRotationMatrix2D(((size - 1) / 2, (size - 1) / 2), angle, 1.0)
        kernel = cv2.warpAffine(kernel, rotation, (size, size))
        kernel_sum = float(kernel.sum())
        if kernel_sum == 0:
            return image.copy()
        kernel /= kernel_sum
        return cv2.filter2D(image, -1, kernel, borderType=cv2.BORDER_REFLECT_101)


@register
class DefocusBlur(ImageTransform):
    name = "defocus_blur"

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        sigma = max(0.0, float(_require(parameters, "sigma")))
        if sigma == 0:
            return image.copy()
        return cv2.GaussianBlur(image, (0, 0), sigmaX=sigma, sigmaY=sigma)


@register
class JpegCompression(ImageTransform):
    name = "jpeg_compression"
    supports_refinement = False

    def normalize_parameters(self, parameters: dict[str, Any]) -> dict[str, Any]:
        normalized = parameters.copy()
        normalized["quality"] = int(np.clip(round(float(_require(parameters, "quality"))), 1, 100))
        return normalized

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        quality = self.normalize_parameters(parameters)["quality"]
        success, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not success:
            raise RuntimeError("OpenCV failed to encode a JPEG transform")
        decoded = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
        if decoded is None:
            raise RuntimeError("OpenCV failed to decode a JPEG transform")
        return decoded


@register
class ResolutionDegradation(ImageTransform):
    name = "resolution_degradation"

    _INTERPOLATIONS = {
        "area": cv2.INTER_AREA,
        "linear": cv2.INTER_LINEAR,
        "nearest": cv2.INTER_NEAREST,
        "cubic": cv2.INTER_CUBIC,
    }

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        scale = float(np.clip(float(_require(parameters, "scale")), 0.01, 1.0))
        interpolation_name = str(parameters.get("interpolation", "area"))
        if interpolation_name not in self._INTERPOLATIONS:
            raise ValueError(f"Unsupported interpolation: {interpolation_name}")
        height, width = image.shape[:2]
        small_size = (max(1, round(width * scale)), max(1, round(height * scale)))
        small = cv2.resize(
            image, small_size, interpolation=self._INTERPOLATIONS[interpolation_name]
        )
        return cv2.resize(small, (width, height), interpolation=cv2.INTER_LINEAR)


@register
class Fog(ImageTransform):
    name = "fog"

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        strength = float(np.clip(float(_require(parameters, "strength")), 0.0, 1.0))
        if strength == 0:
            return image.copy()
        height, width = image.shape[:2]
        rng = np.random.default_rng(context.seed)
        coarse_height, coarse_width = max(2, height // 32), max(2, width // 32)
        noise = rng.uniform(0.7, 1.0, (coarse_height, coarse_width)).astype(np.float32)
        veil = cv2.resize(noise, (width, height), interpolation=cv2.INTER_CUBIC)
        veil = cv2.GaussianBlur(veil, (0, 0), sigmaX=max(width, height) / 40)
        alpha = (strength * veil)[..., None]
        fog_color = np.full_like(image, 235, dtype=np.float32)
        return as_uint8(image.astype(np.float32) * (1.0 - alpha) + fog_color * alpha)


@register
class PartialOcclusion(ImageTransform):
    name = "partial_occlusion"
    supports_refinement = True

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        if context.target_box is None:
            raise ValueError("partial_occlusion requires a target detection box")
        fraction = float(np.clip(float(_require(parameters, "fraction")), 0.0, 1.0))
        if fraction == 0:
            return image.copy()
        position = str(parameters.get("position", "center"))
        color_name = str(parameters.get("color", "mean"))
        x1, y1, x2, y2 = context.target_box
        height, width = image.shape[:2]
        x1i, x2i = sorted((int(np.clip(x1, 0, width)), int(np.clip(x2, 0, width))))
        y1i, y2i = sorted((int(np.clip(y1, 0, height)), int(np.clip(y2, 0, height))))
        box_height = max(1, y2i - y1i)
        occlusion_height = max(1, round(box_height * fraction))
        if position == "top":
            oy1 = y1i
        elif position == "bottom":
            oy1 = max(y1i, y2i - occlusion_height)
        elif position == "center":
            oy1 = max(y1i, round((y1i + y2i - occlusion_height) / 2))
        else:
            raise ValueError(f"Unsupported occlusion position: {position}")
        oy2 = min(y2i, oy1 + occlusion_height)
        output = image.copy()
        if color_name == "mean":
            color = tuple(int(value) for value in image.mean(axis=(0, 1)))
        elif color_name == "black":
            color = (0, 0, 0)
        elif color_name == "white":
            color = (255, 255, 255)
        else:
            raise ValueError(f"Unsupported occlusion color: {color_name}")
        cv2.rectangle(output, (x1i, oy1), (x2i, oy2), color, thickness=-1)
        return output


@register
class Glare(ImageTransform):
    name = "glare"

    def apply(
        self, image: np.ndarray, parameters: dict[str, Any], context: TransformContext
    ) -> np.ndarray:
        intensity = float(np.clip(float(_require(parameters, "intensity")), 0.0, 1.0))
        radius_fraction = float(np.clip(float(parameters.get("radius_fraction", 0.25)), 0.01, 1.0))
        center_x = float(np.clip(float(parameters.get("center_x", 0.5)), 0.0, 1.0))
        center_y = float(np.clip(float(parameters.get("center_y", 0.5)), 0.0, 1.0))
        height, width = image.shape[:2]
        yy, xx = np.ogrid[:height, :width]
        radius = max(1.0, radius_fraction * max(height, width))
        distance_squared = (xx - center_x * width) ** 2 + (yy - center_y * height) ** 2
        mask = np.exp(-distance_squared / (2.0 * radius**2)).astype(np.float32)
        alpha = (intensity * mask)[..., None]
        return as_uint8(image.astype(np.float32) * (1.0 - alpha) + 255.0 * alpha)
