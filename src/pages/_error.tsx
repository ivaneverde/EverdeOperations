import type { NextPage } from "next";

type ErrorProps = { statusCode?: number };

const ErrorPage: NextPage<ErrorProps> = ({ statusCode }) => {
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>
        {statusCode ? `Error ${statusCode}` : "An error occurred"}
      </h1>
      <p style={{ color: "#555" }}>
        Something went wrong while loading this page.
      </p>
    </main>
  );
};

ErrorPage.getInitialProps = async ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? 500 : 404;
  return { statusCode };
};

export default ErrorPage;
