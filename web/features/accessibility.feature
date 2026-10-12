@browser
Feature: Accessibility
  Automated WCAG 2.2 AA checks with axe-core, in both colour schemes and with
  the explanation panel open (ARCH-29).

  Background:
    Given the site is up

  Scenario Outline: The page has no WCAG AA violations in the <scheme> colour scheme
    Given the user prefers the "<scheme>" colour scheme
    When I visit the home page
    And I select the "Complex" example
    And I click the "RUN" instruction
    Then the page has no WCAG AA accessibility violations

    Examples:
      | scheme |
      | dark   |
      | light  |
