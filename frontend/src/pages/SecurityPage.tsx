// Reserved for Person 2. useApi().api.analyzeSecurity(text) is the shared private API method.
import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

export default function SecurityPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PAUSE. CHECK. PROTECT.</p>
          <h1>
            A little clarity,
            <br />
            before you click.
          </h1>
          <p>Private, text-based risk assessment for suspicious messages.</p>
        </div>
      </div>
      <div className="form-panel max-w-2xl">
        <span className="empty-icon">
          <ShieldCheck size={30} />
        </span>
        <h2 className="mt-5 text-xl font-semibold">
          Security workspace reserved
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-stone-500">
          Person 2 owns the private analyzer and this dedicated page. The shared
          API method is ready for integration.
        </p>
        <p className="notice mt-5">
          Security text is never a public post. The analyzer must assess pasted
          text and URL structure without visiting submitted links. A risk
          assessment cannot guarantee safety.
        </p>
        <Link className="button-secondary mt-6" to="/">
          Back to dashboard
        </Link>
      </div>
    </>
  );
}
