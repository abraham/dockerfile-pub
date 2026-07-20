@browser
Feature: Site navigation

  Background:
    Given the site is up

  Scenario: Home page loads
    When I visit the home page
    Then the page title is "Dockerfile Explainer"
