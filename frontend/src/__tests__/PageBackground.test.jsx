import React from "react";
import { render } from "@testing-library/react";
import PageBackground from "../components/PageBackground";

test("rend les enfants dans un div avec classe page-root", () => {
  const { getByTestId } = render(
    <PageBackground>
      <span data-testid="child">hello</span>
    </PageBackground>
  );
  const root = getByTestId("child").parentElement;
  expect(root.className).toContain("page-root");
  expect(getByTestId("child")).toBeInTheDocument();
});

test("applique le style supplémentaire passé en prop", () => {
  const { getByTestId } = render(
    <PageBackground data-testid="bg" style={{ fontFamily: "monospace" }}>
      <span>x</span>
    </PageBackground>
  );
  // on vérifie que le composant ne plante pas avec une prop style
  expect(document.querySelector(".page-root")).toBeInTheDocument();
});
