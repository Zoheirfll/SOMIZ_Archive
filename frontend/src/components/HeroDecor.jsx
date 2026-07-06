const HeroDecor = () => (
  <div
    data-testid="hero-decor"
    style={{
      position: "absolute",
      top: -30,
      right: -30,
      width: 140,
      height: 140,
      borderRadius: "50%",
      background: "rgba(251,191,36,0.18)",
      pointerEvents: "none",
    }}
  />
);

export default HeroDecor;
