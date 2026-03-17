import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { StatusBanner } from "../components/StatusBanner";
import { useConfig } from "../contexts/ConfigContext";

type MenuActionProps = {
  label: string;
  to: string;
};

function MenuAction({ label, to }: MenuActionProps): JSX.Element {
  return (
    <Link className="primary-button home-menu-button" to={to}>
      {label}
    </Link>
  );
}

export function HomePage(): JSX.Element {
  const { config } = useConfig();

  return (
    <Layout>
      <section className="card home-menu-card">
        <h1 className="home-menu-title">Menu</h1>
        {!config ? (
          <StatusBanner
            variant="info"
            message="Complete Setup first. Other menu actions stay hidden until a spreadsheet is configured."
          />
        ) : null}
        <div className="home-menu-actions">
          <MenuAction label="Setup" to="/setup" />
          {config ? <MenuAction label="Add" to="/add" /> : null}
          {config ? <MenuAction label="Tail" to="/tail" /> : null}
          {config ? <MenuAction label="Search" to="/search" /> : null}
        </div>
      </section>
    </Layout>
  );
}
