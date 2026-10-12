@browser
Feature: Site navigation

  Background:
    Given the site is up

  Scenario: Home page loads
    When I visit the home page
    Then the page title is "Dockerfile Explainer"

  Scenario: Using the page triggers no Content Security Policy violations
    Given Content Security Policy violations are recorded
    When I visit the home page
    And I click the "FROM" instruction
    And I select the "Complex" example
    Then no Content Security Policy violations were recorded
