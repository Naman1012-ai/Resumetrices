/* faq.js - Accessible Smooth Accordion Animations */

document.addEventListener('DOMContentLoaded', () => {
  const triggers = document.querySelectorAll('.accordion-trigger');

  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      const contentId = trigger.getAttribute('aria-controls');
      const content = document.getElementById(contentId);

      // Collapse all other items
      triggers.forEach(otherTrigger => {
        if (otherTrigger !== trigger) {
          otherTrigger.setAttribute('aria-expanded', 'false');
          const otherContentId = otherTrigger.getAttribute('aria-controls');
          const otherContent = document.getElementById(otherContentId);
          if (otherContent) {
            otherContent.style.maxHeight = '0px';
          }
        }
      });

      // Toggle current item
      if (isExpanded) {
        trigger.setAttribute('aria-expanded', 'false');
        if (content) {
          content.style.maxHeight = '0px';
        }
      } else {
        trigger.setAttribute('aria-expanded', 'true');
        if (content) {
          // Set max-height to the scrollHeight to transition smoothly
          content.style.maxHeight = content.scrollHeight + 'px';
        }
      }
    });

    // Support keyboard navigation (Space and Enter are native for buttons, but let's make sure focus outline handles nicely)
    trigger.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        trigger.click();
      }
    });
  });

  // Handle window resizing to adjust max-height of expanded content
  window.addEventListener('resize', () => {
    const activeTrigger = document.querySelector('.accordion-trigger[aria-expanded="true"]');
    if (activeTrigger) {
      const contentId = activeTrigger.getAttribute('aria-controls');
      const content = document.getElementById(contentId);
      if (content) {
        // Remove transitions temporarily during resize to prevent visual lag
        const originalTransition = content.style.transition;
        content.style.transition = 'none';
        content.style.maxHeight = content.scrollHeight + 'px';
        
        // Force reflow
        content.offsetHeight;
        
        // Restore transition
        content.style.transition = originalTransition;
      }
    }
  });
});
