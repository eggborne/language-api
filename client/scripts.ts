import './reset.css';
import './style.css';

document.getElementById('check-button')?.addEventListener('click', function () {
  const wordInput = document.getElementById('wordInput') as HTMLInputElement;
  const word = wordInput.value;
  fetch(`/check?word=${encodeURIComponent(word)}`)
    .then(response => response.json())
    .then(data => {
      const resultText = `Word ${word.toUpperCase()} ${data.exists ? `exists!` : `does not exist.`}`;
      const resultElement = document.getElementById('result') as HTMLInputElement;
      resultElement.innerText = resultText;
    })
    .catch(error => console.error('Error:', error));
});
