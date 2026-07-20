@browser
Feature: Example switcher

  Users can switch between three built-in Dockerfile examples (Simple, Average,
  Complex) using the toggle group above the viewer.

  Background:
    Given the site is up

  Scenario: The Simple example is shown by default
    When I visit the home page
    Then the Dockerfile viewer contains "node:26-alpine"
    And the Dockerfile viewer contains "CMD"

  Scenario: Switching to the Average example updates the Dockerfile
    When I visit the home page
    And I select the "Average" example
    Then the Dockerfile viewer contains "nginx:alpine"
    And the Dockerfile viewer contains "HEALTHCHECK"

  Scenario: Switching to the Complex example updates the Dockerfile
    When I visit the home page
    And I select the "Complex" example
    Then the Dockerfile viewer contains "NODE_ENV=production"
    And the Dockerfile viewer contains "ENTRYPOINT"

  Scenario: Switching examples closes any open explanation panel
    When I visit the home page
    And I click the "FROM" instruction
    Then the explanation panel is open
    When I select the "Average" example
    Then the explanation panel is closed
