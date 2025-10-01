// src/features/auth/templates/MagicLinkEmailHtml.tsx

import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "@react-email/components";

interface MagicLinkEmailHtmlProps {
	magicLink: string;
	minutesUntilExpiry: number;
}

export const MagicLinkEmailHtml = ({ magicLink, minutesUntilExpiry }: MagicLinkEmailHtmlProps) => {
	return (
		<Html>
			<Head />
			<Preview>Sign in to Travel Scam Alert</Preview>
			<Body style={main}>
				<Container style={container}>
					{/* Flat Header */}
					<Section style={header}>
						<Text style={headerText}>TRAVEL SCAM ALERT</Text>
					</Section>

					{/* Main Content Block */}
					<Section style={contentBlock}>
						<Heading style={title}>Sign in to your account</Heading>
						<Text style={description}>You requested a magic link to access your account.</Text>

						<Button href={magicLink} style={flatButton}>
							CONFIRM SIGN IN
						</Button>

						<Text style={timer}>{minutesUntilExpiry} MIN</Text>
						<Text style={timerLabel}>LINK VALIDITY</Text>
					</Section>

					{/* Alternative Access */}
					<Section style={altAccess}>
						<Text style={altLabel}>MANUAL ACCESS</Text>
						<Section style={linkBox}>
							<Text style={linkContent}>{magicLink}</Text>
						</Section>
					</Section>

					{/* Footer */}
					<Section style={footer}>
						<Text style={footerLine}>Everyone Should Be Safe Everywhere</Text>
						<Text style={footerCopy}>© {new Date().getFullYear()} TRAVEL SCAM ALERT</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	);
};

// Flat Flush Design Styles - Minimalist
const main = {
	backgroundColor: "#ffffff",
	fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
	margin: "0",
	padding: "0",
};

const container = {
	backgroundColor: "#ffffff",
	margin: "0 auto",
	padding: "0",
	maxWidth: "480px",
	overflow: "hidden",
};

// Flat Header
const header = {
	backgroundColor: "#000000",
	padding: "24px",
	margin: "0",
};

const headerText = {
	color: "#ffffff",
	fontSize: "11px",
	fontWeight: "700",
	letterSpacing: "2px",
	margin: "0",
	textAlign: "center" as const,
};

// Main Content Block
const contentBlock = {
	backgroundColor: "#f8f8f8",
	padding: "48px 32px",
	textAlign: "center" as const,
};

const title = {
	color: "#000000",
	fontSize: "20px",
	fontWeight: "400",
	margin: "0 0 12px 0",
	letterSpacing: "-0.5px",
};

const description = {
	color: "#666666",
	fontSize: "14px",
	lineHeight: "20px",
	margin: "0 0 32px 0",
};

const flatButton = {
	backgroundColor: "#000000",
	border: "none",
	borderRadius: "0",
	color: "#ffffff",
	fontSize: "12px",
	fontWeight: "700",
	letterSpacing: "1px",
	padding: "16px 32px",
	textDecoration: "none",
	display: "inline-block",
};

const timer = {
	color: "#000000",
	fontSize: "32px",
	fontWeight: "200",
	margin: "32px 0 4px 0",
	textAlign: "center" as const,
};

const timerLabel = {
	color: "#999999",
	fontSize: "10px",
	fontWeight: "600",
	letterSpacing: "1px",
	margin: "0",
	textAlign: "center" as const,
};

// Alternative Access
const altAccess = {
	backgroundColor: "#ffffff",
	padding: "32px 24px",
	borderTop: "1px solid #f0f0f0",
};

const altLabel = {
	color: "#999999",
	fontSize: "10px",
	fontWeight: "600",
	letterSpacing: "1px",
	margin: "0 0 16px 0",
	textAlign: "center" as const,
};

const linkBox = {
	backgroundColor: "#f8f8f8",
	border: "1px solid #e0e0e0",
	padding: "16px",
	margin: "0",
};

const linkContent = {
	color: "#333333",
	fontSize: "11px",
	fontFamily: "'Courier New', monospace",
	wordBreak: "break-all" as const,
	margin: "0",
	lineHeight: "16px",
};

// Footer
const footer = {
	backgroundColor: "#000000",
	padding: "32px 24px",
	textAlign: "center" as const,
};

const footerLine = {
	color: "#ffffff",
	fontSize: "11px",
	margin: "0 0 8px 0",
	letterSpacing: "0.5px",
};

const footerCopy = {
	color: "#666666",
	fontSize: "9px",
	letterSpacing: "1px",
	margin: "0",
};

// Export a function that returns HTML string for direct use
export const MagicLinkEmailHtmlString = (props: MagicLinkEmailHtmlProps): string => {
	const { magicLink, minutesUntilExpiry } = props;

	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Sign in to Travel Scam Alert</title>
	<link href="https://fonts.googleapis.com/css2?family=Inter:wght@200;400;600;700&display=swap" rel="stylesheet">
</head>
<body style="margin: 0; padding: 0; background-color: #ffffff; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
	<table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #ffffff;">
		<tr>
			<td align="center" style="padding: 0;">
				<table cellpadding="0" cellspacing="0" border="0" width="480" style="background-color: #ffffff; max-width: 480px;">
					<!-- Black Header -->
					<tr>
						<td style="background-color: #000000; padding: 24px; text-align: center;">
							<p style="color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 2px; margin: 0;">TRAVEL SCAM ALERT</p>
						</td>
					</tr>

					<!-- Main Content -->
					<tr>
						<td style="background-color: #f8f8f8; padding: 48px 32px; text-align: center;">
							<h1 style="color: #000000; font-size: 20px; font-weight: 400; margin: 0 0 12px 0; letter-spacing: -0.5px;">Sign in to your account</h1>
							<p style="color: #666666; font-size: 14px; line-height: 20px; margin: 0 0 32px 0;">
								You requested a magic link to access your account.
							</p>

							<!-- CTA Button -->
							<table cellpadding="0" cellspacing="0" border="0" align="center">
								<tr>
									<td style="background-color: #000000;">
										<a href="${magicLink}" style="display: inline-block; background-color: #000000; color: #ffffff; font-size: 12px; font-weight: 700; letter-spacing: 1px; padding: 16px 32px; text-decoration: none;">
											CONFIRM SIGN IN
										</a>
									</td>
								</tr>
							</table>

							<!-- Timer -->
							<p style="color: #000000; font-size: 32px; font-weight: 200; margin: 32px 0 4px 0;">${minutesUntilExpiry} MIN</p>
							<p style="color: #999999; font-size: 10px; font-weight: 600; letter-spacing: 1px; margin: 0;">LINK VALIDITY</p>
						</td>
					</tr>

					<!-- Alternative Access -->
					<tr>
						<td style="background-color: #ffffff; padding: 32px 24px; border-top: 1px solid #f0f0f0;">
							<p style="color: #999999; font-size: 10px; font-weight: 600; letter-spacing: 1px; margin: 0 0 16px 0; text-align: center;">MANUAL ACCESS</p>
							<div style="background-color: #f8f8f8; border: 1px solid #e0e0e0; padding: 16px;">
								<p style="color: #333333; font-size: 11px; font-family: 'Courier New', monospace; word-break: break-all; margin: 0; line-height: 16px;">
									${magicLink}
								</p>
							</div>
						</td>
					</tr>

					<!-- Footer -->
					<tr>
						<td style="background-color: #000000; padding: 32px 24px; text-align: center;">
							<p style="color: #ffffff; font-size: 11px; margin: 0 0 8px 0; letter-spacing: 0.5px;">Everyone Should Be Safe Everywhere</p>
							<p style="color: #666666; font-size: 9px; letter-spacing: 1px; margin: 0;">© ${new Date().getFullYear()} TRAVEL SCAM ALERT</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>
	`.trim();
};
