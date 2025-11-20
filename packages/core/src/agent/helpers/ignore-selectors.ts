/**
 * Ignore Selectors - CSS selectors for elements that should be ignored by the agent
 * These elements will be filtered out from the DOM state and the agent won't see or interact with them
 */

export const IGNORE_SELECTORS: string[] = [
  // Education wrapper that's closed/hidden
  '#app > div.app-inner-wrapper.h-100 > div > div.application-layout-wrapper > div.app-layout-content > div.education-wrapper.is-education-closed',
  
  // Navbar button to ignore
  '#app > div.app-inner-wrapper.h-100 > div > div.application-layout-wrapper > div.flex.flex--dir-col.navbar-wrapper > div.top-bar-v3.navbar-toolbar.flex.flex--align-center > div.navbar-items.pl-4 > section.flex.navbar-items-right > div.flex.flex--align-center.navbar-actions.ml-3 > div.d-inline-flex.justify-center.align-items-center > button',
  
  // Add more selectors here as needed
  // Example: '.hidden-overlay',
  // Example: '[aria-hidden="true"]:not([role="dialog"])',
];

