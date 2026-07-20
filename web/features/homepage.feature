@browser
Feature: Homepage

  Background:
    Given the site is up

  Scenario: Visiting the homepage shows the expected title and content
    When I visit the home page
    Then the page title is "Dockerfile Explainer"
    And I should see the heading "Dockerfile Explainer"
    And I should see the text "Click any highlighted instruction to learn what it does"
