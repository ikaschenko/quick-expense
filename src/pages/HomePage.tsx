import { Link } from "react-router-dom";
import { Layout } from "../components/Layout";
import { useConfig } from "../contexts/ConfigContext";

type MenuActionProps = {
  label: string;
  to?: string;
  unavailableReason?: string;
};

function MenuAction({ label, to, unavailableReason }: MenuActionProps): JSX.Element {
  if (!to) {
    return (
      <span
        aria-disabled="true"
        className="primary-button home-menu-button menu-action-disabled"
        title={unavailableReason}
      >
        {label}
      </span>
    );
  }

  return (
    <Link className="primary-button home-menu-button" to={to}>
      {label}
    </Link>
  );
}

export function HomePage(): JSX.Element {
  const { config } = useConfig();
  const setupFirstMessage = "Complete Setup first to unlock this action.";

  return (
    <Layout>
      <section className="card home-menu-card">
        <h1 className="home-menu-title">Menu</h1>
        <div className="home-menu-actions">
          <MenuAction label="Setup" to="/setup" />
          <MenuAction
            label="Add"
            to={config ? "/add" : undefined}
            unavailableReason={!config ? setupFirstMessage : undefined}
          />
          <MenuAction
            label="Tail"
            to={config ? "/tail" : undefined}
            unavailableReason={!config ? setupFirstMessage : undefined}
          />
          <MenuAction
            label="Search"
            to={config ? "/search" : undefined}
            unavailableReason={!config ? setupFirstMessage : undefined}
          />
        </div>
      </section>
    </Layout>
  );
}
