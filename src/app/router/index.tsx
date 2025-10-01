// src/app/router/index.tsx

import { Authenticated, Unauthenticated } from "convex/react";
import { Redirect, Route, Switch } from "wouter";

import App from "@pages/App";
import MagicLinkPage from "@pages/Auth/MagicLinkPage";
import PrivacyPolicy from "@pages/Privacy";
import TermsOfService from "@pages/Terms";

export function AppRoutes() {
	return (
		<Switch>
			<Route path="/">{() => <App />}</Route>
			<Route path="/link">
				{() => (
					<>
						<Authenticated>
							<Redirect to="/" />
						</Authenticated>
						<Unauthenticated>
							<MagicLinkPage />
						</Unauthenticated>
					</>
				)}
			</Route>
			<Route path="/terms">{() => <TermsOfService />}</Route>
			<Route path="/privacy">{() => <PrivacyPolicy />}</Route>
			<Route>
				<Redirect to="/" />
			</Route>
		</Switch>
	);
}
