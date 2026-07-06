import { useState, useEffect, useRef } from "react";

/**
 * Anime un compteur de 0 → target en `duration` ms (easeOutQuart).
 * Utilise requestAnimationFrame en production ; se replie sur setTimeout
 * (compatible jest.useFakeTimers) quand rAF n'est pas disponible ou mocké.
 *
 * @param {number|null|undefined} target  Valeur cible
 * @param {number} duration               Durée en ms (défaut 800)
 * @returns {number|null}
 */
const useCountUp = (target, duration = 800) => {
  const [current, setCurrent] = useState(target == null ? null : 0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (target == null) {
      setCurrent(null);
      return;
    }

    setCurrent(0);

    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - progress, 4);
      setCurrent(Math.round(eased * target));

      if (progress < 1) {
        // Utilise rAF si disponible, sinon setTimeout 16 ms
        if (typeof requestAnimationFrame === "function") {
          timerRef.current = requestAnimationFrame(animate);
        } else {
          timerRef.current = setTimeout(animate, 16);
        }
      }
    };

    // Premier tick
    if (typeof requestAnimationFrame === "function") {
      timerRef.current = requestAnimationFrame(animate);
    } else {
      timerRef.current = setTimeout(animate, 16);
    }

    return () => {
      if (timerRef.current != null) {
        if (typeof cancelAnimationFrame === "function") {
          cancelAnimationFrame(timerRef.current);
        }
        clearTimeout(timerRef.current);
      }
    };
  }, [target, duration]);

  return current;
};

export default useCountUp;
