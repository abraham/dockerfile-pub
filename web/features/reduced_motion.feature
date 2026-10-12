@browser
Feature: Reduced motion
  Users who ask their OS for reduced motion get no transitions (ARCH-12).
  Each scenario switches example first, because the indicator deliberately
  skips its transition on the very first render.

  Background:
    Given the site is up

  Scenario: Transitions are disabled when reduced motion is preferred
    Given the user prefers reduced motion
    When I visit the home page
    And I select the "Average" example
    Then the explanation panel and example indicator do not animate

  Scenario: Transitions run when no motion preference is set
    When I visit the home page
    And I select the "Average" example
    Then the explanation panel and example indicator animate
