import "../styles/animations.css";

const PageBackground = ({ children, style = {} }) => (
  <div className="page-root" style={style}>
    {children}
  </div>
);

export default PageBackground;
