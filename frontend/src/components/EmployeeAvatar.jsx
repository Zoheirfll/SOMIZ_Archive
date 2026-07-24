import { useEffect, useState } from "react";
import api from "../services/api";
import { theme } from "../styles/theme";

const EmployeeAvatar = ({ employee, size = 56, fontSize = 20, light = false, shape = "circle" }) => {
  const [photoUrl, setPhotoUrl] = useState(null);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    if (employee?.has_photo) {
      api
        .get(`/employees/${employee.id}/photo/`, { responseType: "blob" })
        .then((res) => {
          if (cancelled) return;
          url = URL.createObjectURL(res.data);
          setPhotoUrl(url);
        })
        .catch(() => setPhotoUrl(null));
    } else {
      setPhotoUrl(null);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [employee?.id, employee?.has_photo]);

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: shape === "square" ? 14 : "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  };

  if (photoUrl) {
    return (
      <div style={{ ...baseStyle, border: light ? "2px solid rgba(255,255,255,0.3)" : `1px solid ${theme.border}` }}>
        <img
          src={photoUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...baseStyle,
        background: light ? "rgba(255,255,255,0.15)" : theme.primaryBg,
        border: light ? "2px solid rgba(255,255,255,0.3)" : `1px solid ${theme.primaryBorder}`,
        color: light ? "#fff" : theme.primary,
        fontWeight: 800,
        fontSize,
      }}
    >
      {employee?.prenom?.[0]}
      {employee?.nom?.[0]}
    </div>
  );
};

export default EmployeeAvatar;
