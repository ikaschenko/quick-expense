import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { DateDisplayFormat, readDateDisplayFormat, writeDateDisplayFormat } from "../utils/date";

export function DisplayPreferencesCard(): JSX.Element {
  const [dateDisplayFormat, setDateDisplayFormat] = useState<DateDisplayFormat>(() => readDateDisplayFormat(localStorage));

  const handleChange = (format: DateDisplayFormat): void => {
    setDateDisplayFormat(format);
    writeDateDisplayFormat(localStorage, format);
  };

  return (
    <div className="card setup-card">
      <div className="setup-card-icon">
        <CalendarDays size={24} aria-hidden />
        <span className="setup-card-title">Display preferences</span>
      </div>
      <div className="input-group setup-preference-group">
        <label className="input-label" htmlFor="date-display-format">Date format</label>
        <select
          id="date-display-format"
          className="input"
          value={dateDisplayFormat}
          onChange={(event) => handleChange(event.target.value as DateDisplayFormat)}
        >
          <option value="locale">Browser default</option>
          <option value="mdy">MM/DD/YYYY</option>
          <option value="dmy">DD/MM/YYYY</option>
          <option value="iso">YYYY-MM-DD</option>
        </select>
      </div>
    </div>
  );
}
