export default function AuthField({
  id,
  label,
  icon: Icon,
  action,
  helper,
  trailing,
  className = "",
  ...inputProps
}) {
  return (
    <div className={`auth-field ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <label className="auth-field__label" htmlFor={id}>
          {label}
        </label>
        {action}
      </div>
      <div className="auth-field__control">
        {Icon && <Icon aria-hidden="true" className="auth-field__icon" size={19} weight="bold" />}
        <input id={id} {...inputProps} />
        {trailing}
      </div>
      {helper && <div className="auth-field__helper">{helper}</div>}
    </div>
  );
}
