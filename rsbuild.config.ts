import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

export default defineConfig({
  html: {
    meta: {
      charset: {
        charset: "UTF-8",
      },
      description: "Travel Scam Alert - Everyone Should Be Safe Everywhere",
    },
    favicon: "public/logo.png",
    title: "Travel Scam Alert",
    // Inject critical inline styles and script to prevent white flash
    tags: [
      {
        tag: "style",
        head: true,
        append: false,
        children: `
					html, body {
						background-color: #15151a !important;
						margin: 0;
						padding: 0;
					}
					#root {
						background-color: #15151a !important;
						min-height: 100vh;
					}
					/* Target all canvases immediately */
					canvas {
						background-color: #15151a !important;
						background: #15151a !important;
					}
					/* Globe container and all children */
					.globe-container, .globe-container * {
						background-color: #15151a !important;
					}
					/* Target all divs in right column */
					.w-2\\/3 {
						background-color: #15151a !important;
					}
					.w-2\\/3 * {
						background-color: transparent !important;
					}
					.w-2\\/3 canvas {
						background-color: #15151a !important;
					}
					/* Override any inline styles */
					[style*="background"] {
						background-color: #15151a !important;
					}
					/* Three.js specific */
					.scene-nav-info, .scene-container {
						background-color: #15151a !important;
					}
					/* Ensure absolute positioned elements are dark */
					.absolute, .relative, .fixed {
						background-color: transparent;
					}
					section, .inset-0 {
						background-color: #15151a !important;
					}
				`,
      },
      {
        tag: "script",
        head: true,
        append: false,
        children: `
					// Immediately set backgrounds before anything renders
					if (document.documentElement) {
						document.documentElement.style.backgroundColor = '#15151a';
					}

					// Wait for DOM to be ready
					if (document.readyState === 'loading') {
						document.addEventListener('DOMContentLoaded', function() {
							if (document.body) {
								document.body.style.backgroundColor = '#15151a';

								// Listen for any new canvas elements and set their background
								const observer = new MutationObserver((mutations) => {
									mutations.forEach((mutation) => {
										mutation.addedNodes.forEach((node) => {
											if (node.nodeName === 'CANVAS') {
												node.style.backgroundColor = '#15151a';
											}
											if (node.nodeName === 'DIV' && node.className && node.className.includes('globe')) {
												node.style.backgroundColor = '#15151a';
											}
										});
									});
								});
								observer.observe(document.body, { childList: true, subtree: true });
							}
						});
					} else {
						// DOM already loaded
						if (document.body) {
							document.body.style.backgroundColor = '#15151a';

							// Listen for any new canvas elements and set their background
							const observer = new MutationObserver((mutations) => {
								mutations.forEach((mutation) => {
									mutation.addedNodes.forEach((node) => {
										if (node.nodeName === 'CANVAS') {
											node.style.backgroundColor = '#15151a';
										}
										if (node.nodeName === 'DIV' && node.className && node.className.includes('globe')) {
											node.style.backgroundColor = '#15151a';
										}
									});
								});
							});
							observer.observe(document.body, { childList: true, subtree: true });
						}
					}
				`,
      },
    ],
  },

  plugins: [pluginReact()],

  server: {
    host: "localhost",
    port: 3000,
  },
});
