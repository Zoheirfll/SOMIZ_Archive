const Skeleton = ({ width = "100%", height = 16, radius = 6, style = {} }) => (
  <div
    data-testid="skeleton"
    style={{
      width,
      height,
      borderRadius: radius,
      background: "linear-gradient(90deg, #E2E8F0 25%, #F1F5F9 50%, #E2E8F0 75%)",
      backgroundSize: "200% 100%",
      animation: "skeletonPulse 1.4s ease-in-out infinite",
      ...style,
    }}
  />
);

export default Skeleton;
