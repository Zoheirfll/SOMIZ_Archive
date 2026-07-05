import { theme } from "../styles/theme";

const Skeleton = ({ width = "100%", height = 16, radius = 6, style = {} }) => (
  <div
    data-testid="skeleton"
    style={{
      width,
      height,
      borderRadius: radius,
      background: `linear-gradient(90deg, ${theme.border} 25%, ${theme.bg} 50%, ${theme.border} 75%)`,
      backgroundSize: "200% 100%",
      animation: "skeletonPulse 1.4s ease-in-out infinite",
      ...style,
    }}
  />
);

export default Skeleton;
