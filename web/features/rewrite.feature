@browser
Feature: Rewrite with on-device AI
  The Rewrite button exists only where Chrome's on-device model is supported
  (AIR-8). CI has no model, so the flow runs against a fake one (spec §11).

  Background:
    Given the site is up

  Scenario: There is no Rewrite button without built-in AI
    Given the browser has no built-in AI
    When I visit the home page
    Then there is no Rewrite button

  Scenario: A rewrite opens as an explainable example
    Given a fake on-device AI model
    And Content Security Policy violations are recorded
    When I visit the home page
    And I open the rewrite dialog
    And I ask the AI to "Run as a non-root user"
    Then the rewrite dialog shows what changed
    When I open the rewrite in the viewer
    Then the "Rewritten" example is selected
    And the Dockerfile viewer contains "USER node"
    When I click the "USER" instruction
    Then the explanation panel is open
    And no Content Security Policy violations were recorded

  Scenario Outline: The rewrite dialog has no WCAG AA violations in the <scheme> colour scheme
    Given a fake on-device AI model
    And the user prefers the "<scheme>" colour scheme
    When I visit the home page
    And I open the rewrite dialog
    And I ask the AI to "Make the image smaller"
    Then the rewrite dialog shows what changed
    And the page has no WCAG AA accessibility violations

    Examples:
      | scheme |
      | dark   |
      | light  |
