import { renderHook, act } from "@testing-library/react";
import useCountUp from "../hooks/useCountUp";

// Remplace rAF/cancelAF par setTimeout/clearTimeout pour que
// jest.useFakeTimers() puisse contrôler l'animation.
beforeAll(() => {
  global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
});

jest.useFakeTimers();

test("retourne 0 au montage puis la valeur cible", () => {
  const { result } = renderHook(() => useCountUp(100, 500));
  expect(result.current).toBe(0);
  act(() => { jest.advanceTimersByTime(600); });
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
  act(() => { jest.advanceTimersByTime(200); });
  expect(result.current).not.toBeNaN();
});
