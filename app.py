import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

class NeuralNetwork:
    def __init__(self):
        # 5 inputs, 4 hidden nodes, 2 outputs [Throttle, Turn]
        np.random.seed(10)
        self.weights_ih = np.array([
            [-0.8, -1.2,  0.0,  1.2,  0.8],  # Hidden 0: Right bias
            [ 0.8,  1.2,  0.0, -1.2, -0.8],  # Hidden 1: Left bias
            [ 0.0, -1.5, -2.5, -1.5,  0.0],  # Hidden 2: Obstacle ahead (Brake & Turn)
            [ 0.5,  0.5,  0.5,  0.5,  0.5]   # Hidden 3: Cruising speed
        ])
        self.weights_ho = np.array([
            [ 0.5,  0.5, -1.0,  0.8],  # Throttle output
            [-1.2,  1.2,  0.0,  0.0]   # Turn output (-1 = Left, +1 = Right)
        ])
        self.bias_h = np.zeros((4, 1))
        self.bias_o = np.zeros((2, 1))

    def predict(self, inputs):
        x = np.array(inputs).reshape(-1, 1)
        # ReLU activation for hidden layer
        hidden = np.maximum(0, np.dot(self.weights_ih, x) + self.bias_h)
        # Tanh activation for output layer (-1 to 1)
        output = np.tanh(np.dot(self.weights_ho, hidden) + self.bias_o)
        return hidden.flatten(), output.flatten()

nn = NeuralNetwork()

@app.route('/predict', methods=['POST'])
def predict():
    data = request.json or {}
    sensors = data.get('sensors', [1, 1, 1, 1, 1])
    
    # Run through the neural network
    hidden_act, out_nodes = nn.predict(sensors)
    
    throttle = float(out_nodes[0])
    turn = float(out_nodes[1])
    
    # Safe default speed
    if throttle < 0.3: 
        throttle = 0.5

    # SHARP OVERRIDE: If a car is directly blocking the front sensor, force a hard swerve!
    if sensors[2] < 0.75:
        throttle = 0.3  # Slow down
        # Check which side has more open space and swerve hard
        left_space = sensors[0] + sensors[1]
        right_space = sensors[3] + sensors[4]
        
        if left_space >= right_space:
            turn = -1.0  # Hard swerve Left
        else:
            turn = 1.0   # Hard swerve Right

    return jsonify({
        "throttle": throttle,
        "turn": turn,
        "network": {
            "inputs": sensors,
            "hidden": hidden_act.tolist(),
            "outputs": [throttle, turn],
            "weights_ih": nn.weights_ih.tolist(),
            "weights_ho": nn.weights_ho.tolist()
        }
    })

if __name__ == '__main__':
    print("Neural Network Driving Server Active on Port 5000")
    app.run(host='127.0.0.1', port=5000)