import { renderHook } from "@testing-library/react";
import useCountUp from "../hooks/useCountUp";

// En NODE_ENV=test le hook retourne directement la valeur cible (pas d'animation)
test("retourne la valeur cible directement en test", () => {
  const { result } = renderHook(() => useCountUp(100, 500));
  expect(result.current).toBe(100);
});

test("retourne null si la cible est null", () => {
  const { result } = renderHook(() => useCountUp(null, 500));
  expect(result.current).toBeNull();
});

test("retourne null si la cible est undefined", () => {
  const { result } = renderHook(() => useCountUp(undefined, 500));
  expect(result.current).toBeNull();
});

test("ne produit pas de NaN", () => {
  const { result } = renderHook(() => useCountUp(50, 400));
  expect(result.current).not.toBeNaN();
});
