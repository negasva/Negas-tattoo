function enviarCotizacion(event) {
    event.preventDefault();

    // 1. Aquí va tu lógica de cálculo (ejemplo simple)
    const basePrice = 100000; 
    const sizeMultiplier = document.getElementById('size').value; // Ej: 1.5
    const finalPrice = basePrice * sizeMultiplier;

    // 2. Preparamos los parámetros para el correo
    const templateParams = {
        user_name: document.getElementById('name').value,
        user_email: document.getElementById('email').value,
        message: document.getElementById('idea').value,
        // ESTA ES LA CLAVE: enviamos el resultado del cálculo
        estimated_price: `$${finalPrice.toLocaleString()}`, 
        reply_to: 'negasart@gmail.com'
    };

    // 3. Enviamos a través de EmailJS
    emailjs.send('service_4b1hsm4', 'template_jm5uav8', templateParams)
        .then(function(response) {
           console.log('EXITO!', response.status, response.text);
           alert('Cotización enviada correctamente a tu correo.');
        }, function(error) {
           console.log('ERROR...', error);
        });
}